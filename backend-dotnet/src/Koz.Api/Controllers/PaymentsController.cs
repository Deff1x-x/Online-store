using System.Text.Json.Nodes;
using Koz.Api.Auth;
using Koz.Application.Auth;
using Koz.Application.Payments;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Koz.Api.Controllers;

[ApiController]
public sealed class PaymentsController(PaymentService service, ICurrentUser user) : ControllerBase
{
    [Authorize(Policy=AuthPolicies.AdminOperations),HttpGet("api/payments")] public Task<JsonObject> List(string? method,string? status,CancellationToken ct)=>service.ListAsync(method,status,ct);
    [Authorize(Policy=AuthPolicies.AdminOperations),HttpGet("api/payments/{id}")] public Task<JsonObject> Get(string id,CancellationToken ct)=>service.GetAsync(id,ct);
    [Authorize(Policy=AuthPolicies.Customer),HttpPost("api/payments/orders/{orderId}/pay-online")] public async Task<IActionResult> Pay(string orderId,CancellationToken ct)=>StatusCode(201,await service.InitiateAsync(user.Id,orderId,ct));
    [HttpPost("api/webhooks/kaspi")]
    public IActionResult Kaspi()
    {
        // Fail-closed in every environment until a real provider signature contract exists.
        // Non-production previously accepted unsigned payloads and mutated payment/order state.
        return StatusCode(503, new { message = "Kaspi webhook is disabled until a provider contract is configured", code = "kaspi_webhook_disabled" });
    }
}
