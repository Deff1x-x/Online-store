namespace Koz.Application.Read;

public sealed class PublicReadService(IPublicReadRepository repository)
{
    public async Task<StoreCatalogResponse> GetStoreCatalogAsync(string? storeId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(storeId))
        {
            throw new ReadContractException(400, "store_id is required", "store_id_required");
        }

        return new StoreCatalogResponse(await repository.FindPublicStoreCatalogAsync(storeId, cancellationToken));
    }

    public async Task<ProfileResponse> GetProfileAsync(string? userId, CancellationToken cancellationToken)
    {
        var profile = await repository.FindProfileByUserIdAsync(RequireUserId(userId), cancellationToken);
        if (profile is null)
        {
            throw new ReadContractException(404, "Customer profile was not found", "profile_not_found");
        }

        return new ProfileResponse(profile);
    }

    public async Task<AddressesResponse> GetAddressesAsync(string? userId, CancellationToken cancellationToken)
    {
        var customer = await repository.FindCustomerAddressContextAsync(RequireUserId(userId), cancellationToken);
        if (customer is null)
        {
            throw new ReadContractException(404, "Customer user was not found", "customer_user_not_found");
        }

        if (customer.Role != "customer")
        {
            throw new ReadContractException(403, "Only customer users can have customer records", "customer_role_required");
        }

        if (string.IsNullOrEmpty(customer.StoreId))
        {
            throw new ReadContractException(400, "Customer user must be assigned to a store", "customer_store_required");
        }

        if (string.IsNullOrEmpty(customer.Phone))
        {
            throw new ReadContractException(400, "Customer user must have a phone number", "customer_phone_required");
        }

        // Node creates a missing customer record before returning an empty list. NET-2A is read-only;
        // the externally observable response remains the same without that write side effect.
        return new AddressesResponse(customer.CustomerId is null
            ? []
            : await repository.FindAddressesByCustomerIdAsync(customer.CustomerId, cancellationToken));
    }

    private static string RequireUserId(string? userId) => !string.IsNullOrEmpty(userId)
        ? userId
        : throw new ReadContractException(403, "Access denied", "access_denied");
}
