using System.Text.Json.Nodes;
using Koz.Application.AdminOperations;
using Npgsql;

namespace Koz.Infrastructure.AdminOperations;

public sealed class PostgresAdminOperationsRepository(NpgsqlDataSource dataSource) : IAdminOperationsRepository
{
    private const string OrderProjection = """
        o.id, o.order_number, o.store_id, s.name AS store_name, o.customer_id,
        c.name AS customer_name, c.phone AS customer_phone,
        o.subtotal::text AS subtotal, o.discount_total::text AS discount_total,
        o.delivery_fee::text AS delivery_fee,
        o.online_payment_amount::text AS online_payment_amount,
        o.online_capture_amount::text AS online_capture_amount,
        o.pos_terminal_topup::text AS pos_terminal_topup,
        o.final_total::text AS final_total, o.fulfillment_window, o.payment_status,
        o.delivery_status, o.delivery_date,
        to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
        to_char(o.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
        """;

    public async Task<JsonObject> OrdersAsync(AdminOperationsQuery query, CancellationToken ct)
    {
        var parameters = new List<object?>();
        var where = OrderWhere(query, parameters);
        var total = await ScalarIntAsync($"SELECT COUNT(*)::int FROM orders o {where}", ct, parameters.ToArray());
        parameters.Add(int.Parse(query.Limit!));
        parameters.Add((int.Parse(query.Page!) - 1) * int.Parse(query.Limit!));
        var rows = await ArrayAsync($"""
            SELECT COALESCE(json_agg(x ORDER BY created_at DESC), '[]')::text
            FROM (
              SELECT {OrderProjection}
              FROM orders o JOIN stores s ON s.id=o.store_id JOIN customers c ON c.id=o.customer_id
              {where}
              ORDER BY o.created_at DESC
              LIMIT ${parameters.Count - 1} OFFSET ${parameters.Count}
            ) x
            """, ct, parameters.ToArray());
        return Page("orders", rows, query, total);
    }

    public async Task<JsonObject> OrderAsync(string id, CancellationToken ct)
    {
        var orderId = Guid.Parse(id);
        var order = await ObjectAsync("""
            SELECT row_to_json(x)::text FROM (
              SELECT o.id,o.order_number,o.store_id,o.customer_id,o.delivery_address_id,
                     o.subtotal::text AS subtotal,o.discount_total::text AS discount_total,o.delivery_fee::text AS delivery_fee,
                     o.estimated_weight::text AS estimated_weight,o.actual_weight::text AS actual_weight,
                     o.online_payment_amount::text AS online_payment_amount,o.online_capture_amount::text AS online_capture_amount,
                     o.pos_terminal_topup::text AS pos_terminal_topup,o.final_total::text AS final_total,o.total_price::text AS total_price,
                     o.fulfillment_window,o.delivery_date,o.delivery_time_slot,o.delivery_status,o.payment_status,
                     to_char(o.delivered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS delivered_at,
                     to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
                     to_char(o.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
                     s.name AS store_name, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
              FROM orders o JOIN stores s ON s.id=o.store_id JOIN customers c ON c.id=o.customer_id
              WHERE o.id=$1
            ) x
            """, ct, orderId);
        if (order.Count == 0) throw Error(404, "Order was not found", "order_not_found");
        return new JsonObject
        {
            ["order"] = order,
            ["items"] = await ArrayAsync("""
                SELECT COALESCE(json_agg(x ORDER BY created_at ASC), '[]')::text FROM (
                  SELECT oi.id,oi.order_id,oi.product_id,oi.quantity::text AS quantity,oi.price_per_unit::text AS price_per_unit,
                         oi.line_total::text AS line_total,oi.estimated_weight::text AS estimated_weight,
                         to_char(oi.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
                         to_char(oi.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
                         p.name, p.category, p.unit, p.is_weighted
                  FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=$1
                  ORDER BY oi.created_at ASC
                ) x
                """, ct, orderId),
            ["status_history"] = await ArrayAsync("""
                SELECT COALESCE(json_agg(x ORDER BY created_at ASC), '[]')::text FROM (
                  SELECT osh.id,osh.order_id,osh.old_status,osh.new_status,osh.changed_by,osh.note,
                         to_char(osh.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
                         to_char(osh.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
                         u.name AS changed_by_name, u.email AS changed_by_email
                  FROM order_status_history osh LEFT JOIN users u ON u.id=osh.changed_by
                  WHERE osh.order_id=$1 ORDER BY osh.created_at ASC
                ) x
                """, ct, orderId),
            ["payments"] = await ArrayAsync("""
                SELECT COALESCE(json_agg(x ORDER BY created_at ASC), '[]')::text FROM (
                  SELECT id,order_id,method,amount::text AS amount,status,provider_payload,
                         to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
                         to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
                  FROM payments WHERE order_id=$1 ORDER BY created_at ASC
                ) x
                """, ct, orderId),
        };
    }

    public async Task<JsonObject> UpdateStatusAsync(string id, string deliveryStatus, Guid actor, CancellationToken ct)
    {
        var orderId = Guid.Parse(id);
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        try
        {
            var current = await ObjectAsync(connection, transaction,
                "SELECT row_to_json(orders)::text FROM orders WHERE id=$1 FOR UPDATE", ct, orderId);
            if (current.Count == 0) throw Error(404, "Order was not found", "order_not_found");
            var oldStatus = current["delivery_status"]!.GetValue<string>();
            if (!Allowed(oldStatus, deliveryStatus))
                throw Error(400, "Invalid order delivery status transition", "invalid_status_transition");

            if (deliveryStatus is "failed" or "cancelled")
                await ExecuteAsync(connection, transaction, """
                    UPDATE store_inventory si
                    SET quantity=si.quantity+returned.quantity,
                        stock_quantity=si.stock_quantity+CEIL(returned.quantity)::int,
                        status=(CASE WHEN si.quantity+returned.quantity<=0 THEN 'out_of_stock'
                                     WHEN si.quantity+returned.quantity<=2 THEN 'low_stock' ELSE 'available' END)::inventory_status,
                        updated_at=NOW()
                    FROM (
                       SELECT o.store_id, oi.product_id, SUM(oi.quantity)::numeric AS quantity
                       FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.id=$1
                       GROUP BY o.store_id, oi.product_id
                    ) returned
                    WHERE si.store_id=returned.store_id AND si.product_id=returned.product_id
                    """, ct, orderId);

            if (deliveryStatus == "delivered" && current["pos_terminal_topup"]!.GetValue<decimal>() > 0)
                await ExecuteAsync(connection, transaction,
                    "INSERT INTO payments (order_id,method,amount,status,provider_payload) VALUES ($1,'pos_terminal',$2,'completed','{}'::jsonb)",
                    ct, orderId, current["pos_terminal_topup"]!.GetValue<decimal>());

            var updateSql = deliveryStatus == "delivered"
                ? "UPDATE orders SET delivery_status='delivered',payment_status='fully_paid',delivered_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING row_to_json(orders)::text"
                : "UPDATE orders SET delivery_status=$2::delivery_status,updated_at=NOW() WHERE id=$1 RETURNING row_to_json(orders)::text";
            var order = deliveryStatus == "delivered"
                ? await ObjectAsync(connection, transaction, updateSql, ct, orderId)
                : await ObjectAsync(connection, transaction, updateSql, ct, orderId, deliveryStatus);
            await ExecuteAsync(connection, transaction,
                "INSERT INTO order_status_history(order_id,old_status,new_status,changed_by) VALUES($1,$2::delivery_status,$3::delivery_status,$4)",
                ct, orderId, oldStatus, deliveryStatus, actor);
            await transaction.CommitAsync(ct);
            return new JsonObject { ["order"] = order };
        }
        catch
        {
            await transaction.RollbackAsync(ct);
            throw;
        }
    }

    public async Task<JsonObject> PaymentsAsync(AdminOperationsQuery query, CancellationToken ct)
    {
        var parameters = new List<object?>();
        var where = PaymentWhere(query, parameters);
        var total = await ScalarIntAsync($"SELECT COUNT(*)::int FROM payments p JOIN orders o ON o.id=p.order_id {where}", ct, parameters.ToArray());
        parameters.Add(int.Parse(query.Limit!));
        parameters.Add((int.Parse(query.Page!) - 1) * int.Parse(query.Limit!));
        var rows = await ArrayAsync($"""
            SELECT COALESCE(json_agg(x ORDER BY created_at DESC), '[]')::text FROM (
              SELECT p.id,p.order_id,p.method,p.amount::text AS amount,p.status,p.provider_payload,
                     to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
                     to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
                     o.order_number, o.store_id, s.name AS store_name, o.delivery_status, o.payment_status
              FROM payments p JOIN orders o ON o.id=p.order_id JOIN stores s ON s.id=o.store_id
              {where} ORDER BY p.created_at DESC LIMIT ${parameters.Count - 1} OFFSET ${parameters.Count}
            ) x
            """, ct, parameters.ToArray());
        return Page("payments", rows, query, total);
    }

    public Task<JsonObject> RevenueAsync(AdminOperationsQuery query, CancellationToken ct) =>
        AnalyticsAsync("revenue", """
            SELECT s.id AS store_id, s.name AS store_name, COUNT(o.id)::int AS orders_count,
              COALESCE(SUM(o.final_total),0)::text AS gmv, COALESCE(SUM(o.delivery_fee),0)::text AS delivery_fee_total,
              COALESCE(SUM(o.discount_total),0)::text AS discount_total, COALESCE(AVG(o.final_total),0)::text AS avg_order_value
            FROM stores s LEFT JOIN orders o ON o.store_id=s.id AND o.delivery_status='delivered' {0}
            GROUP BY s.id ORDER BY s.name ASC
            """, query, ct);

    public Task<JsonObject> DeliveryAsync(AdminOperationsQuery query, CancellationToken ct) =>
        AnalyticsAsync("delivery", """
            SELECT s.id AS store_id, s.name AS store_name, COUNT(o.id)::int AS totals,
              COUNT(o.id) FILTER (WHERE o.delivery_status='delivered')::int AS delivered,
              COUNT(o.id) FILTER (WHERE o.delivery_status='failed')::int AS failed,
              COALESCE(AVG(EXTRACT(EPOCH FROM (o.delivered_at-o.created_at))/60)
                FILTER (WHERE o.delivery_status='delivered' AND o.delivered_at IS NOT NULL),0)::text AS avg_delivery_minutes,
              COUNT(o.id) FILTER (WHERE o.fulfillment_window='next_morning')::int AS next_morning_orders
            FROM stores s LEFT JOIN orders o ON o.store_id=s.id {0}
            GROUP BY s.id ORDER BY s.name ASC
            """, query, ct);

    public async Task<JsonObject> StoreReportAsync(string id, AdminOperationsQuery query, CancellationToken ct)
    {
        var storeId = Guid.Parse(id);
        var store = await ObjectAsync("""
            SELECT row_to_json(x)::text FROM (
              SELECT id,name,address,location,operating_hours,delivery_time_min,delivery_time_max,status,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
                to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
              FROM stores WHERE id=$1
            ) x
            """, ct, storeId);
        if (store.Count == 0) throw Error(404, "Store was not found", "store_not_found");
        var subscribers = await ObjectAsync("SELECT json_build_object('total',COUNT(*)::int,'active',COUNT(*) FILTER (WHERE subscription_status='active')::int)::text FROM customers WHERE store_id=$1", ct, storeId);
        var parameters = new List<object?> { storeId };
        var filters = DateFilters(query, parameters, "created_at");
        var orders = await ObjectAsync($"""
            SELECT json_build_object('totals',COUNT(*)::int,'delivered',COUNT(*) FILTER (WHERE delivery_status='delivered')::int,
              'failed',COUNT(*) FILTER (WHERE delivery_status='failed')::int,
              'gmv',COALESCE(SUM(final_total) FILTER (WHERE delivery_status='delivered'),0)::text,
              'online_part',COALESCE(SUM(final_total-pos_terminal_topup) FILTER (WHERE delivery_status='delivered'),0)::text,
              'pos_part',COALESCE(SUM(pos_terminal_topup) FILTER (WHERE delivery_status='delivered'),0)::text,
              'avg',COALESCE(AVG(final_total) FILTER (WHERE delivery_status='delivered'),0)::text)::text
            FROM orders WHERE store_id=$1{filters}
            """, ct, parameters.ToArray());
        return new JsonObject { ["report"] = new JsonObject { ["store"] = store, ["subscribers"] = subscribers, ["orders"] = orders } };
    }

    public async Task<JsonObject> ExportAsync(AdminOperationsQuery query, CancellationToken ct)
    {
        var parameters = new List<object?>();
        var where = OrderWhere(query, parameters);
        var rows = await ArrayAsync($"""
            SELECT COALESCE(json_agg(x ORDER BY created_at DESC), '[]')::text FROM (
              SELECT o.id,o.order_number,o.store_id,s.name AS store_name,o.customer_id,c.name AS customer_name,c.phone AS customer_phone,
                     o.subtotal::text AS subtotal,o.discount_total::text AS discount_total,o.delivery_fee::text AS delivery_fee,
                     o.online_payment_amount::text AS online_payment_amount,o.online_capture_amount::text AS online_capture_amount,
                     o.pos_terminal_topup::text AS pos_terminal_topup,o.final_total::text AS final_total,o.fulfillment_window,o.payment_status,
                     o.delivery_status,o.delivery_date,
                     to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
              FROM orders o JOIN stores s ON s.id=o.store_id JOIN customers c ON c.id=o.customer_id
              {where} ORDER BY o.created_at DESC
            ) x
            """, ct, parameters.ToArray());
        return new JsonObject { ["message"] = "Orders export generated", ["format"] = "rows", ["generated_at"] = DateTimeOffset.UtcNow.ToString("O"), ["rows"] = rows };
    }

    public Task<JsonObject> PromoUsageAsync(string id, CancellationToken ct) => WrapAsync("usage", """
        SELECT COALESCE(json_agg(x ORDER BY used_at DESC), '[]')::text FROM (
          SELECT pcu.*, c.name AS customer_name, c.phone AS customer_phone, o.order_number,
                 o.final_total::text AS final_total, o.delivery_status, o.payment_status
          FROM promo_code_usage pcu JOIN customers c ON c.id=pcu.customer_id LEFT JOIN orders o ON o.id=pcu.order_id
          WHERE pcu.promo_code_id=$1 ORDER BY pcu.used_at DESC
        ) x
        """, ct, Guid.Parse(id));

    public Task<JsonObject> FirstDiscountsAsync(CancellationToken ct) => WrapAsync("first_order_discounts", """
        SELECT COALESCE(json_agg(x ORDER BY created_at DESC), '[]')::text FROM (
          SELECT fod.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email, c.store_id
          FROM first_order_discounts fod JOIN customers c ON c.id=fod.customer_id ORDER BY fod.created_at DESC
        ) x
        """, ct);

    private async Task<JsonObject> AnalyticsAsync(string key, string template, AdminOperationsQuery query, CancellationToken ct)
    {
        var parameters = new List<object?>();
        var dates = DateFilters(query, parameters, "o.created_at");
        var sql = string.Format(template, dates);
        return new JsonObject { [key] = await ArrayAsync($"SELECT COALESCE(json_agg(x ORDER BY store_name ASC),'[]')::text FROM ({sql}) x", ct, parameters.ToArray()) };
    }

    private static string OrderWhere(AdminOperationsQuery query, List<object?> parameters)
    {
        var conditions = new List<string>();
        if (!string.IsNullOrEmpty(query.StoreId)) { parameters.Add(Guid.Parse(query.StoreId)); conditions.Add($"o.store_id=${parameters.Count}"); }
        if (!string.IsNullOrEmpty(query.Status)) { parameters.Add(query.Status); conditions.Add($"o.delivery_status=${parameters.Count}::delivery_status"); }
        conditions.AddRange(DateConditions(query, parameters, "o.created_at"));
        return conditions.Count == 0 ? string.Empty : "WHERE " + string.Join(" AND ", conditions);
    }

    private static string PaymentWhere(AdminOperationsQuery query, List<object?> parameters)
    {
        var conditions = new List<string>();
        if (!string.IsNullOrEmpty(query.StoreId)) { parameters.Add(Guid.Parse(query.StoreId)); conditions.Add($"o.store_id=${parameters.Count}"); }
        if (!string.IsNullOrEmpty(query.Method)) { parameters.Add(query.Method); conditions.Add($"p.method=${parameters.Count}::payment_method"); }
        if (!string.IsNullOrEmpty(query.Status)) { parameters.Add(query.Status); conditions.Add($"p.status=${parameters.Count}::payment_record_status"); }
        conditions.AddRange(DateConditions(query, parameters, "p.created_at"));
        return conditions.Count == 0 ? string.Empty : "WHERE " + string.Join(" AND ", conditions);
    }

    private static string DateFilters(AdminOperationsQuery query, List<object?> parameters, string column)
    {
        var conditions = DateConditions(query, parameters, column);
        return conditions.Count == 0 ? string.Empty : " AND " + string.Join(" AND ", conditions);
    }

    private static List<string> DateConditions(AdminOperationsQuery query, List<object?> parameters, string column)
    {
        var conditions = new List<string>();
        if (!string.IsNullOrEmpty(query.DateFrom)) { parameters.Add(query.DateFrom); conditions.Add($"{column} >= ${parameters.Count}::date"); }
        if (!string.IsNullOrEmpty(query.DateTo)) { parameters.Add(query.DateTo); conditions.Add($"{column} < (${parameters.Count}::date + INTERVAL '1 day')"); }
        return conditions;
    }

    private static bool Allowed(string from, string to) => from switch
    {
        "new" => to is "picked" or "failed" or "cancelled",
        "picked" => to is "in_delivery" or "failed" or "cancelled",
        "in_delivery" => to is "delivered" or "failed",
        _ => false,
    };

    private static JsonObject Page(string key, JsonArray rows, AdminOperationsQuery query, int total) => new()
    {
        [key] = rows,
        ["pagination"] = new JsonObject { ["page"] = int.Parse(query.Page!), ["limit"] = int.Parse(query.Limit!), ["total"] = total },
    };

    private async Task<JsonObject> WrapAsync(string key, string sql, CancellationToken ct, params object?[] values) => new() { [key] = await ArrayAsync(sql, ct, values) };
    private async Task<JsonArray> ArrayAsync(string sql, CancellationToken ct, params object?[] values)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var command = Command(connection, null, sql, values);
        return JsonNode.Parse((await command.ExecuteScalarAsync(ct))!.ToString()!)!.AsArray();
    }
    private async Task<JsonObject> ObjectAsync(string sql, CancellationToken ct, params object?[] values)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        return await ObjectAsync(connection, null, sql, ct, values);
    }
    private static async Task<JsonObject> ObjectAsync(NpgsqlConnection connection, NpgsqlTransaction? transaction, string sql, CancellationToken ct, params object?[] values)
    {
        await using var command = Command(connection, transaction, sql, values);
        var json = await command.ExecuteScalarAsync(ct) as string;
        return json is null ? new JsonObject() : JsonNode.Parse(json)!.AsObject();
    }
    private async Task<int> ScalarIntAsync(string sql, CancellationToken ct, params object?[] values)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var command = Command(connection, null, sql, values);
        return Convert.ToInt32(await command.ExecuteScalarAsync(ct));
    }
    private static async Task ExecuteAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string sql, CancellationToken ct, params object?[] values)
    {
        await using var command = Command(connection, transaction, sql, values);
        await command.ExecuteNonQueryAsync(ct);
    }
    private static NpgsqlCommand Command(NpgsqlConnection connection, NpgsqlTransaction? transaction, string sql, params object?[] values)
    {
        var command = new NpgsqlCommand(sql, connection, transaction);
        foreach (var value in values) command.Parameters.AddWithValue(value ?? DBNull.Value);
        return command;
    }
    private static AdminOperationsContractException Error(int status, string message, string code) => new(status, message, code);
}
