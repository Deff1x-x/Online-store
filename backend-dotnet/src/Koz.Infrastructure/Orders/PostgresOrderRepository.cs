using System.Globalization;
using System.Text.Json;
using Koz.Application.Orders;
using Npgsql;

namespace Koz.Infrastructure.Orders;

public sealed class PostgresOrderRepository(NpgsqlDataSource dataSource, TimeProvider timeProvider) : IOrderRepository
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

    private static NpgsqlCommand Command(NpgsqlConnection connection, NpgsqlTransaction transaction, string sql, params object?[] values)
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
}
