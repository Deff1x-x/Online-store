using Koz.Api.Auth; using Koz.Application.Auth; using Koz.Application.Orders; using Microsoft.AspNetCore.Authorization; using Microsoft.AspNetCore.Mvc;
namespace Koz.Api.Controllers;
[ApiController, Authorize(Policy=AuthPolicies.StoreOperatorRole)] public sealed class ManagerOrdersController(ManagerOrderService service, ICurrentUser user):ControllerBase
{
 [HttpGet("api/my-store/orders")] public async Task<ActionResult<ManagerOrdersResponse>> List([FromQuery]string? status,CancellationToken ct)=>Ok(await service.ListAsync(user.StoreId,status,ct));
 [HttpPut("api/my-store/orders/{id}/pick")] public async Task<ActionResult<ManagerOrderResponse>> Pick(string id,CancellationToken ct)=>Ok(await service.PickAsync(user.StoreId,user.Id,id,ct));
 [HttpPut("api/my-store/orders/{id}/actual-weight")] public async Task<ActionResult<ManagerOrderResponse>> Weight(string id,[FromBody]ManagerActualWeightRequest body,CancellationToken ct)=>Ok(await service.ActualWeightAsync(user.StoreId,id,body,ct));
 [HttpPut("api/my-store/orders/{id}/status")] public async Task<ActionResult<ManagerOrderResponse>> Status(string id,[FromBody]ManagerOrderStatusRequest body,CancellationToken ct)=>Ok(await service.UpdateStatusAsync(user.StoreId,user.Id,id,body,ct));
}
