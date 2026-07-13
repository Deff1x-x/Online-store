using Koz.Api.Auth;
using Koz.Application.Auth;
using Koz.Application.Commerce;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace Koz.Api.Controllers;
[ApiController]
public sealed class CommerceController(CommerceService service, ICurrentUser user):ControllerBase
{
 [Authorize(Policy=AuthPolicies.SubscriptionsAdmin)] [HttpGet("api/subscriptions")] public async Task<ActionResult<SubscriptionsResponse>> List([FromQuery(Name="store_id")]string? store,[FromQuery]string? status,CancellationToken ct)=>Ok(await service.ListAsync(store,status,ct));
 [Authorize(Policy=AuthPolicies.Customer)] [HttpPost("api/subscriptions")] public async Task<ActionResult<CreateSubscriptionResponse>> Create([FromBody]CreateSubscriptionRequest body,CancellationToken ct)=>StatusCode(201,await service.CreateAsync(user.Id,body,ct));
 [Authorize(Policy=AuthPolicies.AdminCustomers)] [HttpPost("api/subscriptions/{customerId}/renew")] public async Task<ActionResult<SubscriptionResponse>> Renew(string customerId,CancellationToken ct)=>Ok(await service.RenewAsync(customerId,ct));
 [Authorize] [HttpPost("api/subscriptions/{customerId}/cancel")] public async Task<ActionResult<SubscriptionResponse>> Cancel(string customerId,[FromBody]CancelSubscriptionRequest body,CancellationToken ct)=>Ok(await service.CancelAsync(user.Id,user.Role,customerId,body,ct));
 [Authorize(Policy=AuthPolicies.Customer)] [HttpPost("api/promocodes/validate")] public async Task<ActionResult<PromoValidationResponse>> Validate([FromBody]PromoValidationRequest body,CancellationToken ct)=>Ok(await service.ValidatePromoAsync(user.Id,body,ct));
}
