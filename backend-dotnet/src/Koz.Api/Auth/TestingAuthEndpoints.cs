using Microsoft.AspNetCore.Authorization;

namespace Koz.Api.Auth;

public static class TestingAuthEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/__test/auth/customer", [Authorize(Policy = AuthPolicies.Customer)] () => Results.Ok());
        app.MapGet("/__test/auth/store-operator", [Authorize(Policy = AuthPolicies.StoreOperator)] () => Results.Ok());
        app.MapGet("/__test/auth/admin-catalog", [Authorize(Policy = AuthPolicies.AdminCatalog)] () => Results.Ok());
        app.MapGet("/__test/auth/admin-operations", [Authorize(Policy = AuthPolicies.AdminOperations)] () => Results.Ok());
        app.MapGet("/__test/auth/admin-customers", [Authorize(Policy = AuthPolicies.AdminCustomers)] () => Results.Ok());
        app.MapGet("/__test/forwarded", (HttpContext ctx) => Results.Json(new
        {
            scheme = ctx.Request.Scheme,
            remote_ip = ctx.Connection.RemoteIpAddress?.ToString(),
        }));
    }
}
