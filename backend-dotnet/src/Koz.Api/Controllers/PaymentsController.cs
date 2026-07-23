using System.Text.Json.Nodes;
using Koz.Api.Auth;
using Koz.Api.Configuration;
using Koz.Application.Auth;
using Koz.Application.Payments;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Koz.Api.Controllers;

[ApiController]
public sealed class PaymentsController(PaymentService service, ICurrentUser user, PaymentsOptions payments) : ControllerBase
{
    [Authorize(Policy = AuthPolicies.AdminOperations), HttpGet("api/payments")]
    public Task<JsonObject> List(string? method, string? status, CancellationToken ct) => service.ListAsync(method, status, ct);

    [Authorize(Policy = AuthPolicies.AdminOperations), HttpGet("api/payments/{id}")]
    public Task<JsonObject> Get(string id, CancellationToken ct) => service.GetAsync(id, ct);

    [Authorize(Policy = AuthPolicies.Customer), HttpPost("api/payments/orders/{orderId}/pay-online")]
    public async Task<IActionResult> Pay(string orderId, CancellationToken ct)
    {
        // Production defaults to disabled (R1). No placeholder URL and no payment/order side effects.
        if (!payments.OnlineInitiationEnabled)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Online payment initiation is disabled until a real payment provider is configured",
                code = "online_payment_disabled",
            });
        }

        return StatusCode(StatusCodes.Status201Created, await service.InitiateAsync(user.Id, orderId, ct));
    }

    [HttpPost("api/webhooks/kaspi")]
    public IActionResult Kaspi()
    {
        // Fail-closed in every environment until a real provider signature contract exists.
        return StatusCode(503, new { message = "Kaspi webhook is disabled until a provider contract is configured", code = "kaspi_webhook_disabled" });
    }
}
