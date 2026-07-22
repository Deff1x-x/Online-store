using System.Globalization;
using System.Text.Json;
using Koz.Application.Orders;
using Npgsql;

namespace Koz.Infrastructure.Orders;

public sealed class PostgresOrderRepository(NpgsqlDataSource dataSource, TimeProvider timeProvider) : IOrderRepository, IManagerOrderRepository, ICustomerOrderRepository, IManagerInventoryRepository
{
    private const string PaymentNote = "hold 80%; capture by actual weight at delivery, remainder via courier POS";

    public async Task<OrderCreateResponse> CreateAsync(string userId, CreateOrderRequest request, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            var customer = await FindCustomerAsync(connection, transaction, userId, cancellationToken);
            EnsureActiveSubscription(customer);
            var deliveryAddressId = Guid.Parse(request.DeliveryAddressId!);
            if (!await HasAddressAsync(connection, transaction, deliveryAddressId, customer!.Id, customer.StoreId, cancellationToken))
            {
                throw new OrderContractException(404, "Delivery address was not found", "delivery_address_not_found");
            }

            var itemInputs = new List<OrderItemInput>();
            var subtotal = 0m;
            var estimatedWeight = 0m;
            foreach (var item in request.Items!)
            {
                var quantity = RoundQuantity(ToNodeNumber(item.Quantity));
                if (string.IsNullOrEmpty(item.ProductId) || quantity <= 0m)
                {
                    throw new OrderContractException(400, "Invalid order item quantity", "invalid_order_item_quantity");
                }

                var product = await FindProductAsync(connection, transaction, Guid.Parse(item.ProductId), customer!.StoreId, cancellationToken);
                if (product is null || !product.IsActive)
                {
                    throw new OrderContractException(400, "Product is not available", "product_not_available");
                }

                if (!product.IsVisible)
                {
                    throw new OrderContractException(400, "Product is not visible in store", "product_not_available");
                }

                if (!product.IsWeighted && decimal.Truncate(quantity) != quantity)
                {
                    throw new OrderContractException(400, "Piece products require integer quantity", "invalid_order_item_quantity");
                }

                if (!await ReserveInventoryAsync(connection, transaction, product.InventoryId, quantity, cancellationToken))
                {
                    throw new OrderContractException(409, "Product reservation conflict", "product_reservation_conflict");
                }

                var price = RoundMoney(product.EffectivePrice);
                var lineTotal = RoundMoney(quantity * price);
                var itemWeight = product.IsWeighted ? quantity : 0m;
                subtotal = RoundMoney(subtotal + lineTotal);
                estimatedWeight = RoundQuantity(estimatedWeight + itemWeight);
                itemInputs.Add(new(product.ProductId, quantity, price, lineTotal, itemWeight));
            }

            var firstDiscount = await FindFirstDiscountAsync(connection, transaction, customer!.Id, cancellationToken);
            var firstAmount = firstDiscount is { IsUsed: false } ? RoundMoney(decimal.Min(firstDiscount.Amount, subtotal)) : 0m;
            var promoResult = await ValidatePromoAsync(connection, transaction, request.PromoCode, customer.Id, customer.StoreId, subtotal, cancellationToken);
            var useFirst = firstAmount >= promoResult.Discount && firstAmount > 0m;
            var usePromo = promoResult.Discount > firstAmount && promoResult.Discount > 0m;
            var discount = useFirst ? firstAmount : promoResult.Discount;
            var settings = await FindSettingsAsync(connection, transaction, customer.StoreId, cancellationToken);
            var threshold = settings?.FreeDeliveryThreshold ?? 5000m;
            var deliveryFee = subtotal < threshold ? RoundMoney(settings?.DeliveryFee ?? 500m) : 0m;
            var finalTotal = RoundMoney(decimal.Max(0m, subtotal - discount) + deliveryFee);
            var preauth = RoundMoney(finalTotal * .8m);
            var remainder = RoundMoney(finalTotal - preauth);
            var fulfillment = CalculateFulfillment(settings?.OpenHour ?? 11, settings?.CloseHour ?? 20);

            var order = await InsertOrderAsync(connection, transaction, new(
                OrderNumber(), customer.StoreId, customer.Id, deliveryAddressId, subtotal, discount, deliveryFee, estimatedWeight,
                preauth, remainder, finalTotal, fulfillment.Window, fulfillment.Date, fulfillment.TimeSlot), cancellationToken);
            var createdItems = new List<OrderItemDto>(itemInputs.Count);
            foreach (var item in itemInputs)
            {
                createdItems.Add(await InsertItemAsync(connection, transaction, order.Id, item, cancellationToken));
            }

            await InsertHistoryAsync(connection, transaction, order.Id, Guid.Parse(userId), cancellationToken);
            if (useFirst)
            {
                await MarkFirstDiscountAsync(connection, transaction, firstDiscount!.Id, order.Id, cancellationToken);
            }
            if (usePromo)
            {
                await InsertPromoUsageAsync(connection, transaction, promoResult.Promo!.Id, customer.Id, order.Id, promoResult.Discount, cancellationToken);
            }

            await transaction.CommitAsync(cancellationToken);
            return new OrderCreateResponse(order.Id.ToString(), order.OrderNumber,
                new(subtotal, useFirst ? firstAmount : 0m, usePromo ? promoResult.Discount : 0m, discount, deliveryFee, finalTotal),
                new(new(preauth, remainder, PaymentNote), new(finalTotal)),
                ToDto(order, createdItems));
        }
        catch
        {
            await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private async Task<CustomerRow?> FindCustomerAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string userId, CancellationToken ct)
    {
        await using var command = Command(connection, transaction, "SELECT c.id,c.store_id,c.subscription_status,c.subscription_end_date FROM customers c WHERE c.user_id=$1 FOR UPDATE", Guid.Parse(userId));
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? new(reader.GetGuid(0), reader.GetGuid(1), reader.GetString(2), reader.IsDBNull(3) ? null : reader.GetFieldValue<DateOnly>(3)) : null;
    }

    private void EnsureActiveSubscription(CustomerRow? customer)
    {
        var today = DateOnly.FromDateTime(timeProvider.GetUtcNow().AddHours(5).UtcDateTime);
        if (customer is null || customer.SubscriptionStatus != "active" || customer.SubscriptionEndDate is null || customer.SubscriptionEndDate < today)
        {
            throw new OrderContractException(403, "Active subscription is required", "subscription_required");
        }
    }

    private static async Task<bool> HasAddressAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid addressId, Guid customerId, Guid storeId, CancellationToken ct)
    {
        await using var command = Command(connection, transaction, "SELECT ca.id FROM customer_addresses ca JOIN store_coverage sc ON sc.id=ca.store_coverage_id WHERE ca.id=$1 AND ca.customer_id=$2 AND sc.store_id=$3", addressId, customerId, storeId);
        return await command.ExecuteScalarAsync(ct) is not null;
    }

    private static async Task<ProductRow?> FindProductAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid productId, Guid storeId, CancellationToken ct)
    {
        const string sql = "SELECT p.id,p.is_weighted,p.is_active,si.id,si.is_visible,COALESCE(si.selling_price,p.price_per_unit) FROM products p JOIN store_inventory si ON si.product_id=p.id WHERE p.id=$1 AND si.store_id=$2";
        await using var command = Command(connection, transaction, sql, productId, storeId);
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? new(reader.GetGuid(0), reader.GetBoolean(1), reader.GetBoolean(2), reader.GetGuid(3), reader.GetBoolean(4), reader.GetDecimal(5)) : null;
    }

    private static async Task<bool> ReserveInventoryAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid inventoryId, decimal quantity, CancellationToken ct)
    {
        const string sql = "UPDATE store_inventory SET quantity=quantity-$2::numeric,stock_quantity=GREATEST(0,stock_quantity-CEIL($2::numeric)::int),status=CASE WHEN quantity-$2::numeric<=0 THEN 'out_of_stock' WHEN quantity-$2::numeric<=2 THEN 'low_stock' ELSE status END,updated_at=NOW() WHERE id=$1 AND quantity>=$2::numeric RETURNING id";
        await using var command = Command(connection, transaction, sql, inventoryId, quantity);
        return await command.ExecuteScalarAsync(ct) is not null;
    }

    private static async Task<FirstDiscountRow?> FindFirstDiscountAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid customerId, CancellationToken ct)
    {
        await using var command = Command(connection, transaction, "SELECT id,amount,is_used FROM first_order_discounts WHERE customer_id=$1 FOR UPDATE", customerId);
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? new(reader.GetGuid(0), reader.GetDecimal(1), reader.GetBoolean(2)) : null;
    }

    private async Task<PromoResult> ValidatePromoAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string? code, Guid customerId, Guid storeId, decimal subtotal, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(code)) return new(0m, null);
        await using var command = Command(connection, transaction, "SELECT id,store_id,discount_type,discount_value,min_order_value,max_uses,usage_per_customer,valid_from,valid_until,is_active FROM promo_codes WHERE code=upper($1) FOR UPDATE", code);
        await using var reader = await command.ExecuteReaderAsync(ct);
        PromoRow? promo = null;
        if (await reader.ReadAsync(ct))
        {
            promo = new(reader.GetGuid(0), reader.IsDBNull(1) ? null : reader.GetGuid(1), reader.GetString(2), reader.GetDecimal(3), reader.GetDecimal(4), reader.IsDBNull(5) ? null : reader.GetInt32(5), reader.GetInt32(6), reader.IsDBNull(7) ? null : reader.GetFieldValue<DateTimeOffset>(7), reader.IsDBNull(8) ? null : reader.GetFieldValue<DateTimeOffset>(8), reader.GetBoolean(9));
        }
        await reader.CloseAsync();
        if (promo is null || !promo.IsActive) throw InvalidPromo("Promo code is invalid");
        if (promo.StoreId is not null && promo.StoreId != storeId) throw InvalidPromo("Promo code is invalid for this store");
        var now = timeProvider.GetUtcNow();
        if (promo.ValidFrom is { } from && from > now) throw InvalidPromo("Promo code is not active yet");
        if (promo.ValidUntil is { } until && until < now) throw InvalidPromo("Promo code has expired");
        if (promo.MinOrderValue > subtotal) throw InvalidPromo("Order total is below promo code minimum");
        if (promo.MaxUses is { } max && await CountUsesAsync(connection, transaction, promo.Id, null, ct) >= max) throw InvalidPromo("Promo code usage limit reached");
        if (await CountUsesAsync(connection, transaction, promo.Id, customerId, ct) >= promo.UsagePerCustomer) throw InvalidPromo("Promo code customer usage limit reached");
        var amount = promo.DiscountType == "percentage" ? RoundMoney(decimal.Min(subtotal, subtotal * promo.DiscountValue / 100m)) : RoundMoney(decimal.Min(subtotal, promo.DiscountValue));
        return new(amount, promo);
    }

    private static OrderContractException InvalidPromo(string message) => new(400, message, "invalid_promo_code");

    private static async Task<int> CountUsesAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid promoId, Guid? customerId, CancellationToken ct)
    {
        await using var command = customerId is null
            ? Command(connection, transaction, "SELECT COUNT(*)::int FROM promo_code_usage WHERE promo_code_id=$1", promoId)
            : Command(connection, transaction, "SELECT COUNT(*)::int FROM promo_code_usage WHERE promo_code_id=$1 AND customer_id=$2", promoId, customerId.Value);
        return Convert.ToInt32(await command.ExecuteScalarAsync(ct), CultureInfo.InvariantCulture);
    }

    private static async Task<DeliverySettingsRow?> FindSettingsAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid storeId, CancellationToken ct)
    {
        await using var command = Command(connection, transaction, "SELECT min_order_value_for_free_delivery,delivery_fee,ordering_open_hour,ordering_close_hour FROM delivery_settings WHERE store_id=$1", storeId);
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? new(reader.GetDecimal(0), reader.GetDecimal(1), reader.GetInt32(2), reader.GetInt32(3)) : null;
    }

    private async Task<OrderRow> InsertOrderAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, NewOrder order, CancellationToken ct)
    {
        const string sql = "INSERT INTO orders(order_number,store_id,customer_id,delivery_address_id,subtotal,discount_total,delivery_fee,estimated_weight,online_payment_amount,pos_terminal_topup,final_total,total_price,fulfillment_window,delivery_date,delivery_time_slot,delivery_status,payment_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12::fulfillment_window,$13,$14,'new','pending') RETURNING *";
        await using var command = Command(connection, transaction, sql, order.OrderNumber, order.StoreId, order.CustomerId, order.DeliveryAddressId, order.Subtotal, order.DiscountTotal, order.DeliveryFee, order.EstimatedWeight, order.Preauth, order.Remainder, order.FinalTotal, order.FulfillmentWindow, order.DeliveryDate, order.DeliveryTimeSlot);
        await using var reader = await command.ExecuteReaderAsync(ct);
        await reader.ReadAsync(ct);
        return ReadOrder(reader);
    }

    private static async Task<OrderItemDto> InsertItemAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid orderId, OrderItemInput item, CancellationToken ct)
    {
        const string sql = "INSERT INTO order_items(order_id,product_id,quantity,price_per_unit,line_total,estimated_weight) VALUES($1,$2,$3,$4,$5,$6) RETURNING *";
        await using var command = Command(connection, transaction, sql, orderId, item.ProductId, item.Quantity, item.PricePerUnit, item.LineTotal, item.EstimatedWeight);
        await using var reader = await command.ExecuteReaderAsync(ct);
        await reader.ReadAsync(ct);
        return ReadItem(reader);
    }

    private static async Task InsertHistoryAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid orderId, Guid userId, CancellationToken ct)
    {
        await using var command = Command(connection, transaction, "INSERT INTO order_status_history(order_id,old_status,new_status,changed_by) VALUES($1,NULL,'new',$2)", orderId, userId);
        await command.ExecuteNonQueryAsync(ct);
    }

    private static async Task MarkFirstDiscountAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid discountId, Guid orderId, CancellationToken ct)
    {
        await using var command = Command(connection, transaction, "UPDATE first_order_discounts SET is_used=TRUE,order_id=$2,updated_at=NOW() WHERE id=$1", discountId, orderId);
        await command.ExecuteNonQueryAsync(ct);
    }

    private static async Task InsertPromoUsageAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid promoId, Guid customerId, Guid orderId, decimal discount, CancellationToken ct)
    {
        await using var command = Command(connection, transaction, "INSERT INTO promo_code_usage(promo_code_id,customer_id,order_id,discount_amount) VALUES($1,$2,$3,$4)", promoId, customerId, orderId, discount);
        await command.ExecuteNonQueryAsync(ct);
    }

    private Fulfillment CalculateFulfillment(int openHour, int closeHour)
    {
        var now = timeProvider.GetUtcNow().AddHours(5);
        var date = DateOnly.FromDateTime(now.UtcDateTime);
        if (now.UtcDateTime.Hour >= openHour && now.UtcDateTime.Hour < closeHour) return new("same_day", date, null);
        if (now.UtcDateTime.Hour >= closeHour) date = date.AddDays(1);
        return new("next_morning", date, "morning_from_11:00");
    }

    private string OrderNumber() => $"ORD-{DateOnly.FromDateTime(timeProvider.GetUtcNow().AddHours(5).UtcDateTime):yyyyMMdd}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}";
    private static decimal RoundMoney(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    private static decimal RoundQuantity(decimal value) => decimal.Round(value, 3, MidpointRounding.AwayFromZero);

    private static decimal ToNodeNumber(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Number when value.TryGetDecimal(out var number) => number,
        JsonValueKind.String when decimal.TryParse(value.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var text) => text,
        JsonValueKind.True => 1m,
        JsonValueKind.False or JsonValueKind.Null => 0m,
        _ => throw new OrderContractException(400, "Invalid order item quantity", "invalid_order_item_quantity"),
    };

    private static NpgsqlCommand Command(NpgsqlConnection connection, NpgsqlTransaction? transaction, string sql, params object?[] values)
    {
        var command = new NpgsqlCommand(sql, connection, transaction);
        for (var index = 0; index < values.Length; index++) command.Parameters.AddWithValue(values[index] ?? DBNull.Value);
        return command;
    }

    private static OrderRow ReadOrder(NpgsqlDataReader row) => new(
        row.GetGuid(0), row.IsDBNull(1) ? null : row.GetString(1), row.GetGuid(2), row.GetGuid(3), row.IsDBNull(4) ? null : row.GetGuid(4),
        row.GetDecimal(5), row.GetDecimal(6), row.GetDecimal(7), row.IsDBNull(8) ? null : row.GetDecimal(8), row.IsDBNull(9) ? null : row.GetDecimal(9),
        row.GetDecimal(10), row.GetDecimal(11), row.GetDecimal(12), row.GetDecimal(13), row.GetDecimal(14), row.GetString(15), row.IsDBNull(16) ? null : row.GetFieldValue<DateOnly>(16),
        row.IsDBNull(17) ? null : row.GetString(17), row.GetString(18), row.GetString(19), row.IsDBNull(20) ? null : row.GetFieldValue<DateTimeOffset>(20), row.GetFieldValue<DateTimeOffset>(21), row.GetFieldValue<DateTimeOffset>(22));

    private static OrderItemDto ReadItem(NpgsqlDataReader row) => new(row.GetGuid(0).ToString(), row.GetGuid(1).ToString(), row.GetGuid(2).ToString(), Numeric(row.GetDecimal(3), "0.000"), Numeric(row.GetDecimal(4), "0.00"), Numeric(row.GetDecimal(5), "0.00"), row.IsDBNull(6) ? null : Numeric(row.GetDecimal(6), "0.000"), Timestamp(row.GetFieldValue<DateTimeOffset>(7)), Timestamp(row.GetFieldValue<DateTimeOffset>(8)));

    private static OrderDto ToDto(OrderRow order, IReadOnlyList<OrderItemDto> items) => new(order.Id.ToString(), order.OrderNumber, order.StoreId.ToString(), order.CustomerId.ToString(), order.DeliveryAddressId?.ToString(), Numeric(order.Subtotal, "0.00"), Numeric(order.DiscountTotal, "0.00"), Numeric(order.DeliveryFee, "0.00"), order.EstimatedWeight is { } estimated ? Numeric(estimated, "0.000") : null, order.ActualWeight is { } actual ? Numeric(actual, "0.000") : null, Numeric(order.OnlinePaymentAmount, "0.00"), Numeric(order.OnlineCaptureAmount, "0.00"), Numeric(order.PosTerminalTopup, "0.00"), Numeric(order.FinalTotal, "0.00"), Numeric(order.TotalPrice, "0.00"), order.FulfillmentWindow, order.DeliveryDate is { } deliveryDate ? DateOnlyTimestamp(deliveryDate) : null, order.DeliveryTimeSlot, order.DeliveryStatus, order.PaymentStatus, order.DeliveredAt is { } delivered ? Timestamp(delivered) : null, Timestamp(order.CreatedAt), Timestamp(order.UpdatedAt), items);
    private static string Numeric(decimal value, string format) => value.ToString(format, CultureInfo.InvariantCulture);
    private static string Timestamp(DateTimeOffset value) => value.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
    private static string DateOnlyTimestamp(DateOnly value) => Timestamp(new DateTimeOffset(value.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(5)));

    public async Task<IReadOnlyList<CustomerOrderListDto>> ListAsync(string userId, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var customerCommand = Command(connection, null, "SELECT id FROM customers WHERE user_id=$1", Guid.Parse(userId));
        var customerId = await customerCommand.ExecuteScalarAsync(ct);
        if (customerId is not Guid customer) return [];
        const string sql = "SELECT id,order_number,subtotal,discount_total,delivery_fee,online_payment_amount,online_capture_amount,pos_terminal_topup,final_total,delivery_status AS status,delivery_status,payment_status,fulfillment_window,delivery_date,created_at FROM orders WHERE customer_id=$1 ORDER BY created_at DESC";
        await using var command = Command(connection, null, sql, customer);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var orders = new List<CustomerOrderListDto>();
        while (await reader.ReadAsync(ct)) orders.Add(new(reader.GetGuid(0).ToString(), reader.IsDBNull(1) ? null : reader.GetString(1), Numeric(reader.GetDecimal(2), "0.00"), Numeric(reader.GetDecimal(3), "0.00"), Numeric(reader.GetDecimal(4), "0.00"), Numeric(reader.GetDecimal(5), "0.00"), Numeric(reader.GetDecimal(6), "0.00"), Numeric(reader.GetDecimal(7), "0.00"), Numeric(reader.GetDecimal(8), "0.00"), reader.GetString(9), reader.GetString(10), reader.GetString(11), reader.GetString(12), reader.IsDBNull(13) ? null : DateOnlyTimestamp(reader.GetFieldValue<DateOnly>(13)), Timestamp(reader.GetFieldValue<DateTimeOffset>(14))));
        return orders;
    }

    public async Task<CustomerOrderDetailDto?> DetailAsync(string userId, string orderId, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var customerCommand = Command(connection, null, "SELECT id FROM customers WHERE user_id=$1", Guid.Parse(userId));
        var customerId = await customerCommand.ExecuteScalarAsync(ct);
        if (customerId is not Guid customer) return null;
        await using var command = Command(connection, null, "SELECT * FROM orders WHERE id=$1 AND customer_id=$2", Guid.Parse(orderId), customer);
        await using var reader = await command.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;
        var order = ReadOrder(reader);
        await reader.CloseAsync();
        var items = new List<CustomerOrderItemDetailDto>();
        await using var itemCommand = Command(connection, null, "SELECT oi.product_id,p.name,oi.quantity,oi.price_per_unit,oi.line_total,oi.estimated_weight FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=$1 ORDER BY p.name ASC", order.Id);
        await using var itemReader = await itemCommand.ExecuteReaderAsync(ct);
        while (await itemReader.ReadAsync(ct)) items.Add(new(itemReader.GetGuid(0).ToString(), itemReader.GetString(1), Numeric(itemReader.GetDecimal(2), "0.000"), Numeric(itemReader.GetDecimal(3), "0.00"), Numeric(itemReader.GetDecimal(4), "0.00"), itemReader.IsDBNull(5) ? null : Numeric(itemReader.GetDecimal(5), "0.000")));
        return new(order.Id.ToString(), order.OrderNumber, order.StoreId.ToString(), order.CustomerId.ToString(), order.DeliveryAddressId?.ToString(), Numeric(order.Subtotal, "0.00"), Numeric(order.DiscountTotal, "0.00"), Numeric(order.DeliveryFee, "0.00"), order.EstimatedWeight is { } estimated ? Numeric(estimated, "0.000") : null, order.ActualWeight is { } actual ? Numeric(actual, "0.000") : null, Numeric(order.OnlinePaymentAmount, "0.00"), Numeric(order.OnlineCaptureAmount, "0.00"), Numeric(order.PosTerminalTopup, "0.00"), Numeric(order.FinalTotal, "0.00"), Numeric(order.TotalPrice, "0.00"), order.FulfillmentWindow, order.DeliveryDate is { } date ? DateOnlyTimestamp(date) : null, order.DeliveryTimeSlot, order.DeliveryStatus, order.PaymentStatus, order.DeliveredAt is { } delivered ? Timestamp(delivered) : null, Timestamp(order.CreatedAt), Timestamp(order.UpdatedAt), items);
    }
    public async Task<IReadOnlyList<ManagerInventoryDto>> InventoryAsync(string storeId,CancellationToken ct){await using var c=await dataSource.OpenConnectionAsync(ct);await using var q=Command(c,null,"SELECT si.id,si.store_id,si.product_id,p.name,p.category,p.unit,p.is_weighted,p.price_per_unit,si.selling_price,COALESCE(si.selling_price,p.price_per_unit),si.quantity,si.stock_quantity,si.is_visible,si.status,si.last_delivery_date FROM store_inventory si JOIN products p ON p.id=si.product_id WHERE si.store_id=$1 ORDER BY p.category,p.name",Guid.Parse(storeId));await using var r=await q.ExecuteReaderAsync(ct);var a=new List<ManagerInventoryDto>();while(await r.ReadAsync(ct))a.Add(Inventory(r));return a;}
    public async Task<ManagerInventoryDto> UpdateInventoryAsync(string store,string product,ManagerInventoryUpdateRequest patch,CancellationToken ct){await using var c=await dataSource.OpenConnectionAsync(ct);await using var t=await c.BeginTransactionAsync(ct);try{var sets=new List<string>{"updated_at=NOW()"};var v=new List<object?>{Guid.Parse(store),Guid.Parse(product)};if(patch.IsVisible.ValueKind!=JsonValueKind.Undefined){v.Add(patch.IsVisible.GetBoolean());sets.Add($"is_visible=${v.Count}");}if(patch.SellingPrice.ValueKind!=JsonValueKind.Undefined){v.Add(patch.SellingPrice.ValueKind==JsonValueKind.Null?null:patch.SellingPrice.GetDecimal());sets.Add($"selling_price=${v.Count}");}if(patch.Quantity.ValueKind!=JsonValueKind.Undefined){v.Add(patch.Quantity.GetDecimal());sets.Add($"quantity=${v.Count}");sets.Add($"stock_quantity=CEIL(${v.Count}::numeric)::int");sets.Add($"status=(CASE WHEN ${v.Count}::numeric<=0 THEN 'out_of_stock' WHEN ${v.Count}::numeric<=2 THEN 'low_stock' ELSE 'available' END)::inventory_status");}await using var q=Command(c,t,$"UPDATE store_inventory SET {string.Join(',',sets)} WHERE store_id=$1 AND product_id=$2 RETURNING id",v.ToArray());if(await q.ExecuteScalarAsync(ct)is null)throw new ManagerOrderContractException(404,"Inventory item was not found","inventory_not_found");await t.CommitAsync(ct);}catch{await t.RollbackAsync(CancellationToken.None);throw;}return await InventoryOne(c,store,product,ct);}
    public async Task<ManagerInventoryDto> ReceiveAsync(string store,string product,decimal quantity,CancellationToken ct){await using var c=await dataSource.OpenConnectionAsync(ct);await using var t=await c.BeginTransactionAsync(ct);try{await using var q=Command(c,t,"UPDATE store_inventory SET quantity=quantity+$3::numeric,stock_quantity=stock_quantity+CEIL($3::numeric)::int,status='available',last_delivery_date=NOW(),updated_at=NOW() WHERE store_id=$1 AND product_id=$2 RETURNING id",Guid.Parse(store),Guid.Parse(product),quantity);if(await q.ExecuteScalarAsync(ct)is null)throw new ManagerOrderContractException(404,"Inventory item was not found","inventory_not_found");await t.CommitAsync(ct);}catch{await t.RollbackAsync(CancellationToken.None);throw;}return await InventoryOne(c,store,product,ct);}
    public async Task<ManagerAnalyticsDto> AnalyticsAsync(string store,string from,string to,CancellationToken ct){await using var c=await dataSource.OpenConnectionAsync(ct);var s=Guid.Parse(store);var funnel=new Dictionary<string,int>();await using(var q=Command(c,null,"SELECT delivery_status,COUNT(*)::int FROM orders WHERE store_id=$1 AND created_at::date BETWEEN $2::date AND $3::date GROUP BY delivery_status",s,from,to)){await using var r=await q.ExecuteReaderAsync(ct);while(await r.ReadAsync(ct))funnel[r.GetString(0)]=r.GetInt32(1);}decimal g,p,a;await using(var q=Command(c,null,"SELECT COALESCE(SUM(final_total) FILTER(WHERE delivery_status='delivered'),0)::numeric,COALESCE(SUM(pos_terminal_topup) FILTER(WHERE delivery_status='delivered'),0)::numeric,COALESCE(AVG(final_total) FILTER(WHERE delivery_status='delivered'),0)::numeric FROM orders WHERE store_id=$1 AND created_at::date BETWEEN $2::date AND $3::date",s,from,to)){await using var r=await q.ExecuteReaderAsync(ct);await r.ReadAsync(ct);g=r.GetDecimal(0);p=r.GetDecimal(1);a=r.GetDecimal(2);}await using var iq=Command(c,null,"SELECT COUNT(*) FILTER(WHERE is_visible=FALSE)::int,COUNT(*) FILTER(WHERE status='out_of_stock')::int,COUNT(*) FILTER(WHERE status='low_stock')::int FROM store_inventory WHERE store_id=$1",s);await using var ir=await iq.ExecuteReaderAsync(ct);await ir.ReadAsync(ct);return new(funnel,Numeric(g,"0.00"),Numeric(p,"0.00"),Numeric(a,"0.00"),ir.GetInt32(0),ir.GetInt32(1),ir.GetInt32(2));}
    private async Task<ManagerInventoryDto> InventoryOne(NpgsqlConnection c,string store,string product,CancellationToken ct){await using var q=Command(c,null,"SELECT si.id,si.store_id,si.product_id,p.name,p.category,p.unit,p.is_weighted,p.price_per_unit,si.selling_price,COALESCE(si.selling_price,p.price_per_unit),si.quantity,si.stock_quantity,si.is_visible,si.status,si.last_delivery_date FROM store_inventory si JOIN products p ON p.id=si.product_id WHERE si.store_id=$1 AND si.product_id=$2",Guid.Parse(store),Guid.Parse(product));await using var r=await q.ExecuteReaderAsync(ct);await r.ReadAsync(ct);return Inventory(r);}
    private static ManagerInventoryDto Inventory(NpgsqlDataReader r)=>new(r.GetGuid(0).ToString(),r.GetGuid(1).ToString(),r.GetGuid(2).ToString(),r.GetString(3),r.GetString(4),r.GetString(5),r.GetBoolean(6),Numeric(r.GetDecimal(7),"0.00"),r.IsDBNull(8)?null:Numeric(r.GetDecimal(8),"0.00"),Numeric(r.GetDecimal(9),"0.00"),Numeric(r.GetDecimal(10),"0.000"),r.GetInt32(11),r.GetBoolean(12),r.GetString(13),r.IsDBNull(14)?null:DateOnlyTimestamp(r.GetFieldValue<DateOnly>(14)));

    private sealed record CustomerRow(Guid Id, Guid StoreId, string SubscriptionStatus, DateOnly? SubscriptionEndDate);
    private sealed record ProductRow(Guid ProductId, bool IsWeighted, bool IsActive, Guid InventoryId, bool IsVisible, decimal EffectivePrice);
    private sealed record FirstDiscountRow(Guid Id, decimal Amount, bool IsUsed);
    private sealed record PromoRow(Guid Id, Guid? StoreId, string DiscountType, decimal DiscountValue, decimal MinOrderValue, int? MaxUses, int UsagePerCustomer, DateTimeOffset? ValidFrom, DateTimeOffset? ValidUntil, bool IsActive);
    private sealed record PromoResult(decimal Discount, PromoRow? Promo);
    private sealed record DeliverySettingsRow(decimal FreeDeliveryThreshold, decimal DeliveryFee, int OpenHour, int CloseHour);
    private sealed record OrderItemInput(Guid ProductId, decimal Quantity, decimal PricePerUnit, decimal LineTotal, decimal EstimatedWeight);
    private sealed record Fulfillment(string Window, DateOnly Date, string? TimeSlot);
    private sealed record NewOrder(string OrderNumber, Guid StoreId, Guid CustomerId, Guid DeliveryAddressId, decimal Subtotal, decimal DiscountTotal, decimal DeliveryFee, decimal EstimatedWeight, decimal Preauth, decimal Remainder, decimal FinalTotal, string FulfillmentWindow, DateOnly DeliveryDate, string? DeliveryTimeSlot);
    private sealed record OrderRow(Guid Id, string? OrderNumber, Guid StoreId, Guid CustomerId, Guid? DeliveryAddressId, decimal Subtotal, decimal DiscountTotal, decimal DeliveryFee, decimal? EstimatedWeight, decimal? ActualWeight, decimal OnlinePaymentAmount, decimal OnlineCaptureAmount, decimal PosTerminalTopup, decimal FinalTotal, decimal TotalPrice, string FulfillmentWindow, DateOnly? DeliveryDate, string? DeliveryTimeSlot, string DeliveryStatus, string PaymentStatus, DateTimeOffset? DeliveredAt, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

    public async Task<IReadOnlyList<ManagerOrderDto>> ListAsync(string storeId, string? status, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        const string select="SELECT o.*,ca.id,sc.address,ca.entrance,ca.floor,ca.apartment,ca.entrance_code,oi.product_id,p.name,oi.quantity,oi.price_per_unit,oi.line_total,oi.estimated_weight FROM orders o LEFT JOIN customer_addresses ca ON ca.id=o.delivery_address_id LEFT JOIN store_coverage sc ON sc.id=ca.store_coverage_id LEFT JOIN order_items oi ON oi.order_id=o.id LEFT JOIN products p ON p.id=oi.product_id WHERE o.store_id=$1";
        var sql = status is null ? select+" ORDER BY o.created_at DESC,p.name" : select+" AND o.delivery_status=$2::delivery_status ORDER BY o.created_at DESC,p.name";
        await using var command = status is null ? Command(connection, null, sql, Guid.Parse(storeId)) : Command(connection, null, sql, Guid.Parse(storeId), status);
        await using var reader = await command.ExecuteReaderAsync(ct); var orders = new List<(OrderRow Order,ManagerDeliveryAddress Address,List<ManagerOrderItem> Items)>(); var index=new Dictionary<Guid,int>();
        while(await reader.ReadAsync(ct)){var order=ReadOrder(reader);if(!index.TryGetValue(order.Id,out var i)){i=orders.Count;index.Add(order.Id,i);var address=reader.IsDBNull(23)?new ManagerDeliveryAddress(null,null,null,null,null,null):new ManagerDeliveryAddress(reader.GetGuid(23).ToString(),ReadText(reader,26),ReadText(reader,25),ReadText(reader,27),ReadText(reader,28),ReadText(reader,24));orders.Add((order,address,new()));}if(!reader.IsDBNull(29))orders[index[order.Id]].Items.Add(new ManagerOrderItem(reader.GetString(30),reader.GetDecimal(31),reader.GetDecimal(33),reader.GetGuid(29).ToString(),reader.GetDecimal(32),reader.IsDBNull(34)?null:reader.GetDecimal(34)));}
        return orders.Select(x=>ToManager(x.Order,x.Address,x.Items)).ToArray();
    }
    public Task<ManagerOrderDto> PickAsync(string storeId, string userId, string orderId, CancellationToken ct) => TransitionAsync(storeId, userId, orderId, "picked", ct);
    public Task<ManagerOrderDto> UpdateStatusAsync(string storeId, string userId, string orderId, string next, CancellationToken ct) => TransitionAsync(storeId, userId, orderId, next, ct);
    private async Task<ManagerOrderDto> TransitionAsync(string storeId,string userId,string orderId,string next,CancellationToken ct)
    {
        await using var connection=await dataSource.OpenConnectionAsync(ct); await using var transaction=await connection.BeginTransactionAsync(ct); try { var order=await LockedAsync(connection,transaction,storeId,orderId,ct); if(!IsTransitionAllowed(order.DeliveryStatus,next)) throw new ManagerOrderContractException(400,"Invalid status transition","invalid_status_transition"); var updated=await UpdateStatusAsync(connection,transaction,order.Id,next,ct); await InsertHistoryAsync(connection,transaction,order.Id,Guid.Parse(userId),order.DeliveryStatus,next,ct); if(next is "failed" or "cancelled") updated=await ReturnInventoryAsync(connection,transaction,updated,ct); if(next=="delivered") updated=await CompleteDeliveredAsync(connection,transaction,updated,Guid.Parse(userId),ct); await transaction.CommitAsync(ct); return ToManager(updated,null,null); } catch { await transaction.RollbackAsync(CancellationToken.None); throw; }
    }
    public async Task<ManagerOrderDto> ActualWeightAsync(string storeId,string orderId,decimal actualWeight,CancellationToken ct)
    {
        await using var connection=await dataSource.OpenConnectionAsync(ct); await using var transaction=await connection.BeginTransactionAsync(ct); try { var order=await LockedAsync(connection,transaction,storeId,orderId,ct); if(order.DeliveryStatus!="picked") throw new ManagerOrderContractException(400,"Invalid status transition","invalid_status_transition"); if(order.EstimatedWeight is not { } estimated || estimated<=0) throw new ManagerOrderContractException(400,"Order estimated_weight is invalid","invalid_estimated_weight"); var goods=order.Subtotal*(actualWeight/estimated); var final=RoundMoney(decimal.Max(0m,goods-order.DiscountTotal)+order.DeliveryFee); var capture=RoundMoney(decimal.Min(order.OnlinePaymentAmount,final)); var pos=RoundMoney(decimal.Max(0m,final-capture)); await using var command=Command(connection,transaction,"UPDATE orders SET actual_weight=$2,final_total=$3,total_price=$3,online_capture_amount=$4,pos_terminal_topup=$5,updated_at=NOW() WHERE id=$1 RETURNING *",order.Id,actualWeight,final,capture,pos); await using var reader=await command.ExecuteReaderAsync(ct); await reader.ReadAsync(ct); var updated=ReadOrder(reader); await reader.CloseAsync(); await transaction.CommitAsync(ct); return ToManager(updated,null,null); } catch { await transaction.RollbackAsync(CancellationToken.None); throw; }
    }
    private static async Task<OrderRow> UpdateStatusAsync(NpgsqlConnection c,NpgsqlTransaction t,Guid id,string status,CancellationToken ct){await using var q=Command(c,t,"UPDATE orders SET delivery_status=$2::delivery_status,updated_at=NOW() WHERE id=$1 RETURNING *",id,status);await using var r=await q.ExecuteReaderAsync(ct);await r.ReadAsync(ct);return ReadOrder(r);}
    private static async Task<OrderRow> LockedAsync(NpgsqlConnection c,NpgsqlTransaction t,string store,string id,CancellationToken ct){await using var q=Command(c,t,"SELECT * FROM orders WHERE id=$1 AND store_id=$2 FOR UPDATE",Guid.Parse(id),Guid.Parse(store));await using var r=await q.ExecuteReaderAsync(ct);if(!await r.ReadAsync(ct))throw new ManagerOrderContractException(404,"Order was not found","order_not_found");return ReadOrder(r);}
    private static async Task InsertHistoryAsync(NpgsqlConnection c,NpgsqlTransaction t,Guid order,Guid user,string oldStatus,string newStatus,CancellationToken ct){await using var q=Command(c,t,"INSERT INTO order_status_history(order_id,old_status,new_status,changed_by) VALUES($1,$2::delivery_status,$3::delivery_status,$4)",order,oldStatus,newStatus,user);await q.ExecuteNonQueryAsync(ct);}
    private static bool IsTransitionAllowed(string from,string to)=>from switch { "new"=>to is "picked" or "failed" or "cancelled", "picked"=>to is "in_delivery" or "failed" or "cancelled", "in_delivery"=>to is "delivered" or "failed", _=>false };
    private static async Task<OrderRow> ReturnInventoryAsync(NpgsqlConnection c,NpgsqlTransaction t,OrderRow order,CancellationToken ct)
    {
        const string sql="UPDATE store_inventory si SET quantity=si.quantity+returned.quantity,stock_quantity=si.stock_quantity+returned.stock_quantity,status='available',updated_at=NOW() FROM (SELECT oi.product_id,SUM(oi.quantity) AS quantity,SUM(CEIL(oi.quantity)::int) AS stock_quantity FROM order_items oi WHERE oi.order_id=$1 GROUP BY oi.product_id) returned WHERE si.store_id=$2 AND si.product_id=returned.product_id";
        await using var q=Command(c,t,sql,order.Id,order.StoreId); await q.ExecuteNonQueryAsync(ct); return order;
    }
    private static async Task<OrderRow> CompleteDeliveredAsync(NpgsqlConnection c,NpgsqlTransaction t,OrderRow order,Guid user,CancellationToken ct)
    {
        if(order.PosTerminalTopup>0){await using var payment=Command(c,t,"INSERT INTO payments(order_id,method,amount,status,provider_payload) VALUES($1,'pos_terminal',$2,'completed',jsonb_build_object('source','courier_pos','confirmed_by',$3::text))",order.Id,order.PosTerminalTopup,user);await payment.ExecuteNonQueryAsync(ct);}
        await using var q=Command(c,t,"UPDATE orders SET payment_status='fully_paid',delivered_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *",order.Id);await using var r=await q.ExecuteReaderAsync(ct);await r.ReadAsync(ct);return ReadOrder(r);
    }
    private static async Task<ManagerOrderDto> DetailAsync(NpgsqlConnection c,NpgsqlTransaction? t,OrderRow order,CancellationToken ct){ManagerDeliveryAddress? address=new(null,null,null,null,null,null); if(order.DeliveryAddressId is { } a){await using var q=Command(c,t,"SELECT ca.id,sc.address,ca.entrance,ca.floor,ca.apartment,ca.entrance_code FROM customer_addresses ca JOIN store_coverage sc ON sc.id=ca.store_coverage_id WHERE ca.id=$1",a);await using var r=await q.ExecuteReaderAsync(ct);if(await r.ReadAsync(ct))address=new(r.GetGuid(0).ToString(),ReadText(r,3),ReadText(r,2),ReadText(r,4),ReadText(r,5),ReadText(r,1));} var items=new List<ManagerOrderItem>();await using(var q=Command(c,t,"SELECT oi.product_id,p.name,oi.quantity,oi.price_per_unit,oi.line_total,oi.estimated_weight FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=$1 ORDER BY p.name",order.Id)){await using var r=await q.ExecuteReaderAsync(ct);while(await r.ReadAsync(ct))items.Add(new(r.GetString(1),r.GetDecimal(2),r.GetDecimal(4),r.GetGuid(0).ToString(),r.GetDecimal(3),r.IsDBNull(5)?null:r.GetDecimal(5)));}return ToManager(order,address,items);}
    private static ManagerOrderDto ToManager(OrderRow o,ManagerDeliveryAddress? a,IReadOnlyList<ManagerOrderItem>? items)=>new(o.Id.ToString(),o.OrderNumber,o.StoreId.ToString(),o.CustomerId.ToString(),o.DeliveryAddressId?.ToString(),Numeric(o.Subtotal,"0.00"),Numeric(o.DiscountTotal,"0.00"),Numeric(o.DeliveryFee,"0.00"),o.EstimatedWeight is { } ew?Numeric(ew,"0.000"):null,o.ActualWeight is { } aw?Numeric(aw,"0.000"):null,Numeric(o.OnlinePaymentAmount,"0.00"),Numeric(o.OnlineCaptureAmount,"0.00"),Numeric(o.PosTerminalTopup,"0.00"),Numeric(o.FinalTotal,"0.00"),Numeric(o.TotalPrice,"0.00"),o.FulfillmentWindow,o.DeliveryDate is { } d?DateOnlyTimestamp(d):null,o.DeliveryTimeSlot,o.DeliveryStatus,o.PaymentStatus,o.DeliveredAt is { } da?Timestamp(da):null,Timestamp(o.CreatedAt),Timestamp(o.UpdatedAt),a,items);
    private static string? ReadText(NpgsqlDataReader r,int ordinal)=>r.IsDBNull(ordinal)?null:r.GetString(ordinal);
}
