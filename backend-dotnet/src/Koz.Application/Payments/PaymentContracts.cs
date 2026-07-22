using System.Text.Json.Nodes;

namespace Koz.Application.Payments;

public sealed class PaymentContractException(int statusCode, string message, string code) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public string Code { get; } = code;
}

public interface IPaymentRepository
{
    Task<JsonObject> ListAsync(string? method, string? status, CancellationToken ct);
    Task<JsonObject> GetAsync(string id, CancellationToken ct);
    Task<JsonObject> InitiateAsync(string userId, string orderId, CancellationToken ct);
    Task<JsonObject> HandleKaspiAsync(JsonObject body, CancellationToken ct);
}

public sealed class PaymentService(IPaymentRepository repository)
{
    public Task<JsonObject> ListAsync(string? method, string? status, CancellationToken ct) => repository.ListAsync(method, status, ct);
    public Task<JsonObject> GetAsync(string id, CancellationToken ct) => repository.GetAsync(id, ct);
    public Task<JsonObject> InitiateAsync(string? userId, string orderId, CancellationToken ct) => repository.InitiateAsync(userId ?? string.Empty, orderId, ct);
    public Task<JsonObject> HandleKaspiAsync(JsonObject body, CancellationToken ct) => repository.HandleKaspiAsync(body, ct);
}
