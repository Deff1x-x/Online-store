using System.Text.Json.Nodes;

namespace Koz.Application.Notifications;

public sealed class NotificationContractException(int statusCode, string message, string code) : Exception(message)
{ public int StatusCode { get; } = statusCode; public string Code { get; } = code; }
public interface INotificationRepository { Task<JsonObject> QueueAsync(string channel, JsonObject body, CancellationToken ct); }
public sealed class NotificationService(INotificationRepository repository)
{ public Task<JsonObject> QueueAsync(string channel, JsonObject body, CancellationToken ct) => repository.QueueAsync(channel, body, ct); }
