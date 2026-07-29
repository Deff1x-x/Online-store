using System.Text.Json;
using Koz.Api.Auth;
using Koz.Application.Auth;
using Koz.Application.Orders;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Koz.Api.Controllers;

[ApiController, Authorize(Policy = AuthPolicies.StoreOperatorRole)]
public sealed class ManagerInventoryController(ManagerInventoryService service, ICurrentUser user) : ControllerBase
{
    [HttpGet("api/my-store/inventory")]
    public async Task<ActionResult<ManagerInventoryResponse>> List(CancellationToken ct) =>
        Ok(await service.ListAsync(user.StoreId, ct));

    [HttpPut("api/my-store/inventory/{productId}")]
    public async Task<ActionResult<ManagerInventoryItemResponse>> Update(string productId, [FromBody] ManagerInventoryUpdateRequest body, CancellationToken ct) =>
        Ok(await service.UpdateAsync(user.StoreId, productId, body, ct));

    [HttpPost("api/my-store/inventory/{productId}/incoming")]
    public async Task<ActionResult<ManagerInventoryItemResponse>> Incoming(string productId, [FromBody] JsonElement body, CancellationToken ct) =>
        Ok(await service.ReceiveAsync(user.StoreId, productId, body.GetProperty("quantity"), ct));

    /// <summary>TZ Б4 alias of А5 <c>POST …/incoming</c>.</summary>
    [HttpPut("api/my-store/inventory/{productId}/receive")]
    public Task<ActionResult<ManagerInventoryItemResponse>> Receive(string productId, [FromBody] JsonElement body, CancellationToken ct) =>
        Incoming(productId, body, ct);

    [HttpGet("api/my-store/analytics")]
    public async Task<ActionResult<ManagerAnalyticsResponse>> Analytics([FromQuery(Name = "date_from")] string? from, [FromQuery(Name = "date_to")] string? to, CancellationToken ct) =>
        Ok(await service.AnalyticsAsync(user.StoreId, from, to, ct));
}
