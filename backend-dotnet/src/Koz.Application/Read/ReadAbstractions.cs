namespace Koz.Application.Read;

public interface IPublicReadRepository
{
    Task<IReadOnlyList<StoreCatalogProduct>> FindPublicStoreCatalogAsync(string storeId, CancellationToken cancellationToken);
    Task<IReadOnlyList<PublicStoreListItem>> FindActiveStoresAsync(CancellationToken cancellationToken);
    Task<CustomerProfile?> FindProfileByUserIdAsync(string userId, CancellationToken cancellationToken);
    Task<CustomerAddressContext?> FindCustomerAddressContextAsync(string userId, CancellationToken cancellationToken);
    Task<IReadOnlyList<CustomerAddress>> FindAddressesByCustomerIdAsync(string customerId, CancellationToken cancellationToken);
}
