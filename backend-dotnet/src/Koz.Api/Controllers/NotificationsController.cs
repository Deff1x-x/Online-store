using System.Text.Json.Nodes;
using Koz.Api.Auth;
using Koz.Application.Notifications;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Koz.Api.Controllers;

[ApiController, Authorize(Policy=AuthPolicies.AdminOperations)]
public sealed class NotificationsController(NotificationService service) : ControllerBase
{
    [HttpPost("api/notifications/sms")] public async Task<IActionResult> Sms(JsonObject body,CancellationToken ct)=>StatusCode(202,await service.QueueAsync("sms",body,ct));
    [HttpPost("api/notifications/email")] public async Task<IActionResult> Email(JsonObject body,CancellationToken ct)=>StatusCode(202,await service.QueueAsync("email",body,ct));
}
