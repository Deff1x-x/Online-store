using Koz.Domain.Auth;
using Microsoft.AspNetCore.Authorization;

namespace Koz.Api.Auth;

public static class AuthPolicies
{
    public const string Customer = "customer";
    public const string StoreOperator = "store_operator";
    public const string AdminCatalog = "admin_catalog";
    public const string AdminOperations = "admin_operations";
    public const string AdminCustomers = "admin_customers";
    public const string SubscriptionsAdmin = "subscriptions_admin";

    public static void Configure(AuthorizationOptions options)
    {
        AddRole(options, Customer, UserRoles.Customer);
        AddRole(options, AdminCatalog, UserRoles.AdminCatalog);
        AddRole(options, AdminOperations, UserRoles.AdminOperations);
        AddRole(options, AdminCustomers, UserRoles.AdminCustomers);
        options.AddPolicy(SubscriptionsAdmin, policy => policy.RequireClaim("role", UserRoles.AdminCatalog, UserRoles.AdminOperations, UserRoles.AdminCustomers));
        options.AddPolicy(StoreOperator, policy => policy.RequireAssertion(context =>
            context.User.HasClaim("role", UserRoles.StoreOperator) &&
            context.User.HasClaim(claim => claim.Type == "store_id" && !string.IsNullOrWhiteSpace(claim.Value))));
    }

    private static void AddRole(AuthorizationOptions options, string name, string role) =>
        options.AddPolicy(name, policy => policy.RequireClaim("role", role));
}
