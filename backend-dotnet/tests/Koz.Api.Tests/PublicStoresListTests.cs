using Koz.Application.Read;
using Xunit;

namespace Koz.Api.Tests;

public sealed class PublicStoresListTests
{
    [Fact]
    public async Task ListStores_returns_active_stores_payload()
    {
        var repository = new FakePublicReadRepository(
        [
            new PublicStoreListItem("11111111-1111-1111-1111-111111111111", "Алматы-1", "д. 4", "active"),
        ]);
        var service = new PublicReadService(repository);

        var response = await service.ListStoresAsync(TestContext.Current.CancellationToken);

        Assert.Single(response.Stores);
        Assert.Equal("Алматы-1", response.Stores[0].Name);
        Assert.Equal("active", response.Stores[0].Status);
    }

    [Fact]
    public void Controller_exposes_public_stores_route()
    {
        var source = File.ReadAllText(Path.Combine(FindRepoRoot(), "backend-dotnet", "src", "Koz.Api", "Controllers", "PublicReadController.cs"));
        Assert.Contains("[HttpGet(\"api/stores\")]", source, StringComparison.Ordinal);
        var appJs = File.ReadAllText(Path.Combine(FindRepoRoot(), "src", "app.js"));
        Assert.Contains("app.use('/api/stores'", appJs, StringComparison.Ordinal);
    }

    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "package.json"))
                && Directory.Exists(Path.Combine(dir.FullName, "backend-dotnet")))
            {
                return dir.FullName;
            }

            dir = dir.Parent;
        }

        throw new DirectoryNotFoundException("repo root");
    }

    private sealed class FakePublicReadRepository(IReadOnlyList<PublicStoreListItem> stores) : IPublicReadRepository
    {
        public Task<IReadOnlyList<StoreCatalogProduct>> FindPublicStoreCatalogAsync(string storeId, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<StoreCatalogProduct>>([]);

        public Task<IReadOnlyList<PublicStoreListItem>> FindActiveStoresAsync(CancellationToken cancellationToken) =>
            Task.FromResult(stores);

        public Task<CustomerProfile?> FindProfileByUserIdAsync(string userId, CancellationToken cancellationToken) =>
            Task.FromResult<CustomerProfile?>(null);

        public Task<CustomerAddressContext?> FindCustomerAddressContextAsync(string userId, CancellationToken cancellationToken) =>
            Task.FromResult<CustomerAddressContext?>(null);

        public Task<IReadOnlyList<CustomerAddress>> FindAddressesByCustomerIdAsync(string customerId, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<CustomerAddress>>([]);
    }
}
