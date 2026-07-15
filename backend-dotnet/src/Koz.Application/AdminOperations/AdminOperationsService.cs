using Koz.Application.Auth;
using System.Text.Json.Nodes;
namespace Koz.Application.AdminOperations;
public sealed class AdminOperationsService(IAdminOperationsRepository repository)
{
    static readonly HashSet<string> Statuses = ["new", "picked", "in_delivery", "delivered", "failed", "cancelled"];
    public Task<JsonObject> OrdersAsync(AdminOperationsQuery q, CancellationToken ct) => repository.OrdersAsync(Normalize(q), ct);
    public Task<JsonObject> OrderAsync(string id, CancellationToken ct) => repository.OrderAsync(id, ct);
    public Task<JsonObject> StatusAsync(string id, AdminOrderStatusRequest body, ICurrentUser user, CancellationToken ct)
    {
        if (body.DeliveryStatus is null || !Statuses.Contains(body.DeliveryStatus)) throw Error(400, "Invalid delivery_status", "invalid_delivery_status");
        if (!Guid.TryParse(user.Id, out var actor)) throw Error(401, "Invalid token", "invalid_token");
        return repository.UpdateStatusAsync(id, body.DeliveryStatus, actor, ct);
    }
    public Task<JsonObject> PaymentsAsync(AdminOperationsQuery q, CancellationToken ct) => repository.PaymentsAsync(Normalize(q), ct);
    public Task<JsonObject> RevenueAsync(AdminOperationsQuery q, CancellationToken ct) => repository.RevenueAsync(q, ct);
    public Task<JsonObject> DeliveryAsync(AdminOperationsQuery q, CancellationToken ct) => repository.DeliveryAsync(q, ct);
    public Task<JsonObject> ReportAsync(string id, AdminOperationsQuery q, CancellationToken ct) => repository.StoreReportAsync(id, q, ct);
    public Task<JsonObject> ExportAsync(AdminOperationsQuery q, CancellationToken ct) => repository.ExportAsync(q, ct);
    public Task<JsonObject> UsageAsync(string id, CancellationToken ct) => repository.PromoUsageAsync(id, ct);
    public Task<JsonObject> DiscountsAsync(CancellationToken ct) => repository.FirstDiscountsAsync(ct);
    static AdminOperationsQuery Normalize(AdminOperationsQuery q)
    {
        var page = Positive(q.Page, 1); var limit = Math.Min(Positive(q.Limit, 20), 100);
        return q with { Page = page.ToString(), Limit = limit.ToString() };
    }
    static int Positive(string? value, int fallback) => int.TryParse(value, out var parsed) && parsed > 0 ? parsed : fallback;
    static AdminOperationsContractException Error(int status, string message, string code) => new(status, message, code);
}
