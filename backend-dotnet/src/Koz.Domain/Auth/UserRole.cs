namespace Koz.Domain.Auth;

public enum UserRole
{
    Customer,
    StoreOperator,
    AdminCatalog,
    AdminOperations,
    AdminCustomers,
}

public static class UserRoles
{
    public const string Customer = "customer";
    public const string StoreOperator = "store_operator";
    public const string AdminCatalog = "admin_catalog";
    public const string AdminOperations = "admin_operations";
    public const string AdminCustomers = "admin_customers";

    public static bool TryParse(string? value, out UserRole role)
    {
        role = value switch
        {
            Customer => UserRole.Customer,
            StoreOperator => UserRole.StoreOperator,
            AdminCatalog => UserRole.AdminCatalog,
            AdminOperations => UserRole.AdminOperations,
            AdminCustomers => UserRole.AdminCustomers,
            _ => default,
        };

        return value is Customer or StoreOperator or AdminCatalog or AdminOperations or AdminCustomers;
    }

    public static string ToContractValue(this UserRole role) => role switch
    {
        UserRole.Customer => Customer,
        UserRole.StoreOperator => StoreOperator,
        UserRole.AdminCatalog => AdminCatalog,
        UserRole.AdminOperations => AdminOperations,
        UserRole.AdminCustomers => AdminCustomers,
        _ => throw new ArgumentOutOfRangeException(nameof(role), role, "Unknown user role."),
    };
}
