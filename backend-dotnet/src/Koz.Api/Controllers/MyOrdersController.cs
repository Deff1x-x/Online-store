using Koz.Api.Auth;
using Koz.Application.Auth;
using Koz.Application.Orders;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Koz.Api.Controllers;

[ApiController]
[Authorize(Policy = AuthPolicies.Customer)]
public sealed class MyOrdersController(CustomerOrderService service, ICurrentUser currentUser) : ControllerBase
{
    [HttpGet("api/my-orders")]
    public async Task<ActionResult<MyOrdersResponse>> List(CancellationToken cancellationToken) =>
        Ok(await service.ListAsync(currentUser.Id, cancellationToken));

    [HttpGet("api/my-orders/{id}")]
    public async Task<ActionResult<MyOrderResponse>> Detail(string id, CancellationToken cancellationToken) =>
        Ok(await service.DetailAsync(currentUser.Id, id, cancellationToken));
}
