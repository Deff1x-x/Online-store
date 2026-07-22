using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Koz.Application.Payments;
using Npgsql;

namespace Koz.Infrastructure.Payments;

public sealed class PostgresPaymentRepository(NpgsqlDataSource dataSource) : IPaymentRepository
{
    public async Task<JsonObject> ListAsync(string? method, string? status, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        var clauses = new List<string>(); var parameters = new List<object?>();
        if (!string.IsNullOrEmpty(method)) { parameters.Add(method); clauses.Add($"p.method=${parameters.Count}"); }
        if (!string.IsNullOrEmpty(status)) { parameters.Add(status); clauses.Add($"p.status=${parameters.Count}"); }
        var sql = $"SELECT p.*,o.order_number,o.payment_status AS order_payment_status FROM payments p JOIN orders o ON o.id=p.order_id {(clauses.Count == 0 ? string.Empty : "WHERE " + string.Join(" AND ", clauses))} ORDER BY p.created_at DESC";
        await using var command = new NpgsqlCommand(sql, connection); foreach (var value in parameters) command.Parameters.AddWithValue(value!);
        await using var reader = await command.ExecuteReaderAsync(ct); var payments = new JsonArray(); while (await reader.ReadAsync(ct)) payments.Add(ToJson(reader, true));
        return new JsonObject { ["payments"] = payments };
    }

    public async Task<JsonObject> GetAsync(string id, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var command = new NpgsqlCommand("SELECT p.*,o.order_number,o.payment_status AS order_payment_status FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.id=$1", connection); command.Parameters.AddWithValue(Guid.Parse(id));
        await using var reader = await command.ExecuteReaderAsync(ct); if (!await reader.ReadAsync(ct)) throw Error(404, "Payment was not found", "payment_not_found");
        return new JsonObject { ["payment"] = ToJson(reader, true) };
    }

    public async Task<JsonObject> InitiateAsync(string userId, string orderId, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct); await using var transaction = await connection.BeginTransactionAsync(ct);
        try
        {
            await using var orderCommand = Cmd(connection, transaction, "SELECT o.id,o.online_payment_amount FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=$1 AND c.user_id=$2 FOR UPDATE OF o", Guid.Parse(orderId), Guid.Parse(userId));
            await using var orderReader = await orderCommand.ExecuteReaderAsync(ct); if (!await orderReader.ReadAsync(ct)) throw Error(404, "Order was not found", "order_not_found"); var order = orderReader.GetGuid(0); var amount = orderReader.GetDecimal(1); await orderReader.CloseAsync();
            if (amount <= 0) throw Error(400, "Order online_payment_amount must be greater than zero", "invalid_online_payment_amount");
            var transactionId = "kaspi-placeholder-" + Guid.NewGuid(); var url = "https://kaspi.placeholder/pay/" + transactionId; var qr = "kaspi-placeholder:" + transactionId;
            var payload = new JsonObject { ["provider"]="kaspi_placeholder", ["placeholder"]=true, ["transaction_id"]=transactionId, ["payment_url"]=url, ["qr"]=qr, ["note"]="No real authorization, capture, or hold is performed." };
            await using var insert = Cmd(connection, transaction, "INSERT INTO payments(order_id,method,amount,status,provider_payload) VALUES($1,'online',$2,'pending',$3::jsonb) RETURNING *", order, amount, payload.ToJsonString());
            await using var paymentReader = await insert.ExecuteReaderAsync(ct); await paymentReader.ReadAsync(ct); var payment=ToJson(paymentReader, false); await paymentReader.CloseAsync(); await transaction.CommitAsync(ct);
            return new JsonObject { ["payment"] = payment, ["payment_url"] = url, ["qr"] = qr };
        }
        catch { await transaction.RollbackAsync(CancellationToken.None); throw; }
    }

    public async Task<JsonObject> HandleKaspiAsync(JsonObject body, CancellationToken ct)
    {
        var paymentId = body["payment_id"]?.GetValue<string>(); var transactionId = body["transaction_id"]?.GetValue<string>();
        if (string.IsNullOrEmpty(paymentId) && string.IsNullOrEmpty(transactionId)) throw Error(400, "payment_id or transaction_id is required", "payment_reference_required");
        await using var connection = await dataSource.OpenConnectionAsync(ct); await using var tx = await connection.BeginTransactionAsync(ct);
        try
        {
            var sql = paymentId is not null ? "SELECT p.*,o.payment_status AS order_payment_status FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.id=$1 FOR UPDATE OF p,o" : "SELECT p.*,o.payment_status AS order_payment_status FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.provider_payload->>'transaction_id'=$1 ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE OF p,o";
            await using var find=Cmd(connection,tx,sql,paymentId ?? transactionId!); await using var r=await find.ExecuteReaderAsync(ct); if(!await r.ReadAsync(ct)) throw Error(404,"Payment was not found","payment_not_found"); var id=r.GetGuid(r.GetOrdinal("id")); var orderId=r.GetGuid(r.GetOrdinal("order_id")); var status=r.GetString(r.GetOrdinal("status")); var orderStatus=r.GetString(r.GetOrdinal("order_payment_status")); var stored=JsonNode.Parse(r.GetString(r.GetOrdinal("provider_payload")))?["transaction_id"]?.GetValue<string>(); var old=ToJson(r,false); await r.CloseAsync();
            if(paymentId is not null && transactionId is not null && stored is not null && stored != transactionId) throw Error(409,"Payment and transaction references do not match","payment_reference_mismatch");
            if(status=="completed") { await tx.CommitAsync(ct); return new JsonObject{{"message","Kaspi placeholder webhook already processed"},{"payment",old}}; }
            if(status!="pending") throw Error(409,"Payment cannot be completed from its current status","invalid_payment_status_transition"); if(orderStatus!="pending") throw Error(409,"Order cannot be marked online paid from its current status","invalid_order_payment_status_transition");
            var webhook = body.ToJsonString(); await using var update=Cmd(connection,tx,"UPDATE payments SET status='completed',provider_payload=provider_payload || jsonb_build_object('kaspi_webhook',$2::jsonb,'completed_at',NOW()),updated_at=NOW() WHERE id=$1 AND status='pending' RETURNING *",id,webhook); await using var ur=await update.ExecuteReaderAsync(ct); if(!await ur.ReadAsync(ct)) throw Error(409,"Payment was updated concurrently","payment_update_conflict"); var updated=ToJson(ur,false); await ur.CloseAsync(); await using var orderUpdate=Cmd(connection,tx,"UPDATE orders SET payment_status='online_paid',updated_at=NOW() WHERE id=$1 AND payment_status='pending' RETURNING id",orderId); if(await orderUpdate.ExecuteScalarAsync(ct) is null) throw Error(409,"Order was updated concurrently","order_update_conflict"); await tx.CommitAsync(ct); return new JsonObject{{"message","Kaspi placeholder webhook processed"},{"payment",updated}};
        } catch { await tx.RollbackAsync(CancellationToken.None); throw; }
    }

    private static NpgsqlCommand Cmd(NpgsqlConnection c,NpgsqlTransaction t,string sql,params object[] values){var x=new NpgsqlCommand(sql,c,t);foreach(var v in values)x.Parameters.AddWithValue(v);return x;}
    private static PaymentContractException Error(int status,string message,string code)=>new(status,message,code);
    private static JsonObject ToJson(NpgsqlDataReader r,bool join)
    {
        int O(string n)=>r.GetOrdinal(n); JsonNode? payload=JsonNode.Parse(r.GetString(O("provider_payload")));
        var result = new JsonObject{{"id",r.GetGuid(O("id")).ToString()},{"order_id",r.GetGuid(O("order_id")).ToString()},{"method",r.GetString(O("method"))},{"amount",r.GetDecimal(O("amount")).ToString("0.00",CultureInfo.InvariantCulture)},{"status",r.GetString(O("status"))},{"provider_payload",payload},{"created_at",r.GetFieldValue<DateTimeOffset>(O("created_at")).ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'",CultureInfo.InvariantCulture)},{"updated_at",r.GetFieldValue<DateTimeOffset>(O("updated_at")).ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'",CultureInfo.InvariantCulture)}};
        if (join) { result["order_number"] = r.IsDBNull(O("order_number")) ? null : r.GetString(O("order_number")); result["order_payment_status"] = r.GetString(O("order_payment_status")); }
        return result;
    }
}
