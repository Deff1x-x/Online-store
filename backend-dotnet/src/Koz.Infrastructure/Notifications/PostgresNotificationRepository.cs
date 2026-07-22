using System.Globalization;
using System.Text.Json.Nodes;
using Koz.Application.Notifications;
using Npgsql;

namespace Koz.Infrastructure.Notifications;

public sealed class PostgresNotificationRepository(NpgsqlDataSource dataSource) : INotificationRepository
{
    public async Task<JsonObject> QueueAsync(string channel, JsonObject body, CancellationToken ct)
    {
        var recipient = body["recipient"]?.GetValue<string>()?.Trim();
        if (string.IsNullOrEmpty(recipient)) throw new NotificationContractException(400, "recipient is required", "recipient_required");
        var template = body["template_key"]?.GetValue<string>(); var payload = body["payload"]?.DeepClone() ?? new JsonObject();
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var command = new NpgsqlCommand("INSERT INTO notification_queue(channel,recipient,template_key,payload,status,scheduled_at) VALUES($1,$2,$3,$4::jsonb,'pending',NOW()) RETURNING *", connection);
        command.Parameters.AddWithValue(channel); command.Parameters.AddWithValue(recipient); command.Parameters.AddWithValue((object?)template ?? DBNull.Value); command.Parameters.AddWithValue(payload.ToJsonString());
        await using var reader = await command.ExecuteReaderAsync(ct); await reader.ReadAsync(ct);
        int O(string n)=>reader.GetOrdinal(n); string T(int i)=>reader.GetFieldValue<DateTimeOffset>(i).ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
        var notification = new JsonObject { ["id"]=reader.GetGuid(O("id")).ToString(), ["channel"]=reader.GetString(O("channel")), ["recipient"]=reader.GetString(O("recipient")), ["template_key"]=reader.IsDBNull(O("template_key"))?null:reader.GetString(O("template_key")), ["payload"]=JsonNode.Parse(reader.GetString(O("payload"))), ["status"]=reader.GetString(O("status")), ["attempts"]=reader.GetInt32(O("attempts")), ["last_error"]=reader.IsDBNull(O("last_error"))?null:reader.GetString(O("last_error")), ["scheduled_at"]=T(O("scheduled_at")), ["sent_at"]=reader.IsDBNull(O("sent_at"))?null:T(O("sent_at")), ["created_at"]=T(O("created_at")), ["updated_at"]=T(O("updated_at")) };
        return new JsonObject { ["message"]="queued for delivery worker", ["notification"]=notification };
    }
}
