using Koz.Application.Auth;

namespace Koz.Api.Auth;

public sealed class HttpCurrentUser(IHttpContextAccessor httpContextAccessor) : ICurrentUser
{
    private System.Security.Claims.ClaimsPrincipal? Principal => httpContextAccessor.HttpContext?.User;

    public string? Id => Claim("id");
    public string? Role => NormalizeRole(Claim("role"));
    public string? StoreId => Claim("store_id");
    public string? CustomerId => Claim("customer_id");
    public string? Email => Claim("email");
    public string? Phone => Claim("phone");

    private string? Claim(string type) => Principal?.FindFirst(type)?.Value;

    private static string? NormalizeRole(string? role) => role switch
    {
        "Customer" => "customer",
        "Store_Op" => "store_operator",
        "Admin_1_Catalog" => "admin_catalog",
        "Admin_2_Operations" => "admin_operations",
        "Admin_3_Customers" => "admin_customers",
        _ => role,
    };
}
