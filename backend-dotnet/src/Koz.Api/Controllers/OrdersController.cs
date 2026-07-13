using Koz.Api.Auth;
using Koz.Application.Auth;
using Koz.Application.Orders;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Koz.Api.Controllers;

[ApiController]
public sealed class OrdersController(OrderService service, ICurrentUser currentUser) : ControllerBase
{
    [Authorize(Policy = AuthPolicies.Customer)]
    [HttpPost("api/orders")]
    public async Task<ActionResult<OrderCreateResponse>> Create([FromBody] CreateOrderRequest body, CancellationToken cancellationToken) =>
        StatusCode(StatusCodes.Status201Created, await service.CreateAsync(currentUser.Id, body, cancellationToken));
}
