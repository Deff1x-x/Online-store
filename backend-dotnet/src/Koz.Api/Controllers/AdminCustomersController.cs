using Koz.Api.Auth;using Koz.Application.AdminCustomers;using Microsoft.AspNetCore.Authorization;using Microsoft.AspNetCore.Mvc;using System.Text.Json.Nodes;
namespace Koz.Api.Controllers;
[ApiController,Authorize(Policy=AuthPolicies.AdminCustomers)] public sealed class AdminCustomersController(AdminCustomerService s):ControllerBase{
 [HttpGet("api/admin/customers/customers")]public Task<JsonObject> List([FromQuery(Name="page")]string? p,[FromQuery(Name="limit")]string? l,[FromQuery(Name="store_id")]string? st,[FromQuery(Name="subscription_status")]string? ss,[FromQuery(Name="search")]string? se,CancellationToken ct)=>s.ListAsync(new(p,l,st,ss,se),ct);
 [HttpGet("api/admin/customers/customers/{id}")]public Task<JsonObject> Detail(string id,CancellationToken ct)=>s.DetailAsync(id,ct);
 [HttpGet("api/admin/customers/subscriptions")]public Task<JsonObject> Subscriptions([FromQuery(Name="store_id")]string? st,[FromQuery] string? status,CancellationToken ct)=>s.SubscriptionsAsync(new(st,status),ct);
 [HttpPut("api/admin/customers/customers/{id}/subscription/renew")]public Task<JsonObject> Renew(string id,CancellationToken ct)=>s.RenewAsync(id,ct);
 [HttpPut("api/admin/customers/customers/{id}/subscription/pause")]public Task<JsonObject> Pause(string id,CancellationToken ct)=>s.PauseAsync(id,ct);
 [HttpPut("api/admin/customers/customers/{id}/subscription/cancel")]public Task<JsonObject> Cancel(string id,AdminCancelRequest? body,CancellationToken ct)=>s.CancelAsync(id,body,ct);
 [HttpGet("api/admin/customers/audit-logs/consents")]public Task<JsonObject> Consent(CancellationToken ct)=>s.ConsentAsync(ct);
 [HttpPost("api/admin/customers/export/customers")]public Task<JsonObject> Export([FromQuery(Name="store_id")]string? st,[FromQuery(Name="subscription_status")]string? ss,[FromQuery(Name="search")]string? se,CancellationToken ct)=>s.ExportAsync(new(null,null,st,ss,se),ct);
}
