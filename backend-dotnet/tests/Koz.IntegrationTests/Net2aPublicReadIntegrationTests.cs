using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;
using Xunit;
using Xunit.Sdk;

namespace Koz.IntegrationTests;

[Collection("NodeApi")]
public sealed class Net2aPublicReadIntegrationTests
{
    private const string TestDatabaseName = "koz_dotnet_net2a_test";
    private const string TestJwtSecret = "net1-testing-jwt-secret-with-at-least-32-characters";

    [Fact]
    [Trait("Category", "Integration")]
    public async Task Node_and_dotnet_public_read_contracts_match()
    {
        var connectionString = GetConnectionStringOrSkip();
        using var factory = new Net1ApiFactory(connectionString);
        using var dotnet = factory.CreateClient();
        using var node = await NodeAuthServer.StartAsync(connectionString, TestContext.Current.CancellationToken);
        using var dataSource = NpgsqlDataSource.Create(connectionString);

        var catalogFixture = await InsertCatalogFixtureAsync(dataSource);
        var nodeCatalog = await node.Client.GetAsync("/api/products/store/11111111-1111-1111-1111-111111111111", TestContext.Current.CancellationToken);
        var dotnetCatalog = await dotnet.GetAsync("/api/products/store/11111111-1111-1111-1111-111111111111", TestContext.Current.CancellationToken);
        await AssertEquivalentAsync(nodeCatalog, dotnetCatalog);
        await AssertCatalogFixtureAsync(nodeCatalog, catalogFixture);

        var unknownStoreId = Guid.NewGuid();
        await AssertEquivalentAsync(
            await node.Client.GetAsync($"/api/products/store/{unknownStoreId}", TestContext.Current.CancellationToken),
            await dotnet.GetAsync($"/api/products/store/{unknownStoreId}", TestContext.Current.CancellationToken));
        await AssertEquivalentAsync(
            await node.Client.GetAsync("/api/products/store/not-a-uuid", TestContext.Current.CancellationToken),
            await dotnet.GetAsync("/api/products/store/not-a-uuid", TestContext.Current.CancellationToken));
        await AssertEquivalentAsync(
            await AuthorizedGetAsync(node.Client, "/api/products/store/11111111-1111-1111-1111-111111111111", "not-a-jwt"),
            await AuthorizedGetAsync(dotnet, "/api/products/store/11111111-1111-1111-1111-111111111111", "not-a-jwt"));

        var customer = await RegisterCustomerAsync(dotnet);
        await AssertEquivalentAsync(
            await AuthorizedGetAsync(node.Client, "/api/my-profile", customer.Token),
            await AuthorizedGetAsync(dotnet, "/api/my-profile", customer.Token));
        await AssertEquivalentAsync(
            await AuthorizedGetAsync(node.Client, "/api/my-addresses", customer.Token),
            await AuthorizedGetAsync(dotnet, "/api/my-addresses", customer.Token));
        await AssertProfileKeysAsync(await AuthorizedGetAsync(node.Client, "/api/my-profile", customer.Token));
        await InsertAddressFixtureAsync(dataSource, customer.CustomerId);

        foreach (var status in new[] { "active", "paused", "cancelled", "expired" })
        {
            await UpdateSubscriptionFixtureAsync(dataSource, customer.CustomerId, status);
            await AssertEquivalentAsync(
                await AuthorizedGetAsync(node.Client, "/api/my-profile", customer.Token),
                await AuthorizedGetAsync(dotnet, "/api/my-profile", customer.Token));
        }

        await AssertEquivalentAsync(
            await AuthorizedGetAsync(node.Client, "/api/my-addresses", customer.Token),
            await AuthorizedGetAsync(dotnet, "/api/my-addresses", customer.Token));
        await AssertAddressFixtureAsync(await AuthorizedGetAsync(node.Client, "/api/my-addresses", customer.Token));

        await AssertEquivalentAsync(
            await node.Client.GetAsync("/api/products", TestContext.Current.CancellationToken),
            await dotnet.GetAsync("/api/products", TestContext.Current.CancellationToken));
        await AssertEquivalentAsync(
            await AuthorizedGetAsync(node.Client, "/api/my-addresses/not-an-endpoint", customer.Token),
            await AuthorizedGetAsync(dotnet, "/api/my-addresses/not-an-endpoint", customer.Token));

        await AssertEquivalentAsync(
            await node.Client.GetAsync("/api/my-profile", TestContext.Current.CancellationToken),
            await dotnet.GetAsync("/api/my-profile", TestContext.Current.CancellationToken));
        await AssertEquivalentAsync(
            await AuthorizedGetAsync(node.Client, "/api/my-addresses", $"{customer.Token}x"),
            await AuthorizedGetAsync(dotnet, "/api/my-addresses", $"{customer.Token}x"));

        foreach (var email in new[] { "manager@koz.kz", "catalog@koz.kz", "admin@koz.kz", "customers@koz.kz" })
        {
            var staff = await dotnet.PostAsJsonAsync("/api/auth/staff/login", new { email, password = "Manager123" }, TestContext.Current.CancellationToken);
            using var staffPayload = JsonDocument.Parse(await staff.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
            var staffToken = staffPayload.RootElement.GetProperty("token").GetString()!;
            await AssertEquivalentAsync(
                await AuthorizedGetAsync(node.Client, "/api/my-profile", staffToken),
                await AuthorizedGetAsync(dotnet, "/api/my-profile", staffToken));
            await AssertEquivalentAsync(
                await AuthorizedGetAsync(node.Client, "/api/my-addresses", staffToken),
                await AuthorizedGetAsync(dotnet, "/api/my-addresses", staffToken));
        }

        var expiredCustomerToken = CreateTestToken(Guid.NewGuid(), "customer", DateTimeOffset.UtcNow.AddMinutes(-1));
        await AssertEquivalentAsync(
            await AuthorizedGetAsync(node.Client, "/api/my-profile", expiredCustomerToken),
            await AuthorizedGetAsync(dotnet, "/api/my-profile", expiredCustomerToken));
        var unknownCustomerToken = CreateTestToken(Guid.NewGuid(), "customer", DateTimeOffset.UtcNow.AddMinutes(15));
        await AssertEquivalentAsync(
            await AuthorizedGetAsync(node.Client, "/api/my-profile", unknownCustomerToken),
            await AuthorizedGetAsync(dotnet, "/api/my-profile", unknownCustomerToken));
        await AssertEquivalentAsync(
            await AuthorizedGetAsync(node.Client, "/api/my-addresses", unknownCustomerToken),
            await AuthorizedGetAsync(dotnet, "/api/my-addresses", unknownCustomerToken));
        await AssertEquivalentAsync(
            await MalformedAuthorizationGetAsync(node.Client, "/api/my-profile"),
            await MalformedAuthorizationGetAsync(dotnet, "/api/my-profile"));
    }

    private static async Task<TestCustomer> RegisterCustomerAsync(HttpClient client)
    {
        var phone = $"r{Guid.NewGuid():N}"[..32];
        var otp = await client.PostAsJsonAsync("/api/auth/otp", new { phone }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, otp.StatusCode);
        var registration = await client.PostAsJsonAsync("/api/auth/register", new
        {
            phone,
            code = "1234",
            name = "NET 2A contract customer",
            store_id = "11111111-1111-1111-1111-111111111111",
            privacy_policy = true,
            terms_of_service = true,
        }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Created, registration.StatusCode);
        using var payload = JsonDocument.Parse(await registration.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        return new TestCustomer(
            payload.RootElement.GetProperty("token").GetString()!,
            Guid.Parse(payload.RootElement.GetProperty("user").GetProperty("customer_id").GetString()!));
    }

    private static async Task InsertAddressFixtureAsync(NpgsqlDataSource dataSource, Guid customerId)
    {
        await using var command = dataSource.CreateCommand(
            """
            INSERT INTO customer_addresses (customer_id, store_coverage_id, entrance, floor, apartment, entrance_code, is_default)
            VALUES
              ($1, '22222222-2222-2222-2222-222222222222', '1', NULL, '101', NULL, TRUE),
              ($1, '22222222-2222-2222-2222-222222222222', NULL, '2', NULL, '42', FALSE)
            """);
        command.Parameters.AddWithValue(customerId);
        Assert.Equal(2, await command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken));
    }

    private static async Task<CatalogFixture> InsertCatalogFixtureAsync(NpgsqlDataSource dataSource)
    {
        var visibleFallback = Guid.NewGuid();
        var visibleOverride = Guid.NewGuid();
        var inactive = Guid.NewGuid();
        var hidden = Guid.NewGuid();
        var outOfStock = Guid.NewGuid();
        var withoutInventory = Guid.NewGuid();
        var suffix = Guid.NewGuid().ToString("N");
        await using var productCommand = dataSource.CreateCommand(
            """
            INSERT INTO products (id, name, category, unit, price_per_unit, company_price, is_weighted, is_active)
            VALUES
              ($1, $7, 'vegetables', 'kg', 10.00, 1.00, TRUE, TRUE),
              ($2, $8, 'vegetables', 'pcs', 20.00, 1.00, FALSE, TRUE),
              ($3, $9, 'fruits', 'kg', 30.00, 1.00, FALSE, FALSE),
              ($4, $10, 'dairy', 'pcs', 40.00, 1.00, FALSE, TRUE),
              ($5, $11, 'meat', 'kg', 50.00, 1.00, FALSE, TRUE),
              ($6, $12, 'bakery', 'pcs', 60.00, 1.00, FALSE, TRUE)
            """);
        foreach (var productId in new[] { visibleFallback, visibleOverride, inactive, hidden, outOfStock, withoutInventory })
        {
            productCommand.Parameters.AddWithValue(productId);
        }

        foreach (var name in new[]
                 {
                     $"NET2A visible fallback {suffix}",
                     $"NET2A visible override {suffix}",
                     $"NET2A inactive {suffix}",
                     $"NET2A hidden {suffix}",
                     $"NET2A zero stock {suffix}",
                     $"NET2A no inventory {suffix}",
                 })
        {
            productCommand.Parameters.AddWithValue(name);
        }

        Assert.Equal(6, await productCommand.ExecuteNonQueryAsync(TestContext.Current.CancellationToken));
        await using var inventoryCommand = dataSource.CreateCommand(
            """
            INSERT INTO store_inventory (store_id, product_id, quantity, stock_quantity, selling_price, is_visible, status)
            VALUES
              ('11111111-1111-1111-1111-111111111111', $1, 1.000, 1, NULL, TRUE, 'low_stock'),
              ('11111111-1111-1111-1111-111111111111', $2, 2.000, 2, 12.34, TRUE, 'low_stock'),
              ('11111111-1111-1111-1111-111111111111', $3, 3.000, 3, NULL, TRUE, 'available'),
              ('11111111-1111-1111-1111-111111111111', $4, 4.000, 4, NULL, FALSE, 'available'),
              ('11111111-1111-1111-1111-111111111111', $5, 0.000, 0, NULL, TRUE, 'out_of_stock')
            """);
        foreach (var productId in new[] { visibleFallback, visibleOverride, inactive, hidden, outOfStock })
        {
            inventoryCommand.Parameters.AddWithValue(productId);
        }

        Assert.Equal(5, await inventoryCommand.ExecuteNonQueryAsync(TestContext.Current.CancellationToken));
        return new CatalogFixture(visibleFallback, visibleOverride, inactive, hidden, outOfStock, withoutInventory);
    }

    private static async Task AssertCatalogFixtureAsync(HttpResponseMessage response, CatalogFixture fixture)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal(new[] { "products" }, payload.RootElement.EnumerateObject().Select(property => property.Name));
        var products = payload.RootElement.GetProperty("products").EnumerateArray().ToArray();
        var productIds = products.Select(product => product.GetProperty("product_id").GetString()).ToHashSet();
        Assert.Contains(fixture.VisibleFallback.ToString(), productIds);
        Assert.Contains(fixture.VisibleOverride.ToString(), productIds);
        Assert.DoesNotContain(fixture.Inactive.ToString(), productIds);
        Assert.DoesNotContain(fixture.Hidden.ToString(), productIds);
        Assert.DoesNotContain(fixture.OutOfStock.ToString(), productIds);
        Assert.DoesNotContain(fixture.WithoutInventory.ToString(), productIds);

        var fallback = products.Single(product => product.GetProperty("product_id").GetString() == fixture.VisibleFallback.ToString());
        Assert.Equal(JsonValueKind.String, fallback.GetProperty("price_per_unit").ValueKind);
        Assert.Equal(JsonValueKind.Null, fallback.GetProperty("selling_price").ValueKind);
        Assert.Equal("10.00", fallback.GetProperty("price_per_unit").GetString());
        Assert.Equal("1.000", fallback.GetProperty("quantity").GetString());
        var overrideProduct = products.Single(product => product.GetProperty("product_id").GetString() == fixture.VisibleOverride.ToString());
        Assert.Equal("12.34", overrideProduct.GetProperty("price_per_unit").GetString());
        Assert.Equal("12.34", overrideProduct.GetProperty("selling_price").GetString());
        Assert.Equal(
            new[] { "category", "inventory_id", "is_weighted", "name", "price_per_unit", "product_id", "quantity", "selling_price", "status", "unit" },
            fallback.EnumerateObject().Select(property => property.Name).Order());
    }

    private static async Task AssertProfileKeysAsync(HttpResponseMessage response)
    {
        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        var profile = payload.RootElement.GetProperty("profile");
        Assert.Equal(
            new[] { "customer", "subscription_auto_renew", "subscription_end_date", "subscription_start_date", "subscription_status", "user" },
            profile.EnumerateObject().Select(property => property.Name).Order());
        Assert.Equal(new[] { "email", "id", "name", "phone" }, profile.GetProperty("user").EnumerateObject().Select(property => property.Name).Order());
        Assert.Equal(
            new[] { "email", "id", "name", "phone", "store_id", "subscription_auto_renew", "subscription_end_date", "subscription_start_date", "subscription_status", "user_id" },
            profile.GetProperty("customer").EnumerateObject().Select(property => property.Name).Order());
    }

    private static async Task AssertAddressFixtureAsync(HttpResponseMessage response)
    {
        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal(new[] { "addresses" }, payload.RootElement.EnumerateObject().Select(property => property.Name));
        var addresses = payload.RootElement.GetProperty("addresses");
        Assert.Equal(2, addresses.GetArrayLength());
        Assert.True(addresses[0].GetProperty("is_default").GetBoolean());
        Assert.False(addresses[1].GetProperty("is_default").GetBoolean());
        Assert.Equal(
            new[] { "apartment", "coverage_address", "created_at", "customer_record_id", "entrance", "entrance_code", "entrance_count", "floor", "id", "is_default", "store_coverage_id", "store_id" },
            addresses[0].EnumerateObject().Select(property => property.Name).Order());
        Assert.Equal(JsonValueKind.Null, addresses[0].GetProperty("floor").ValueKind);
        Assert.Equal(JsonValueKind.Null, addresses[0].GetProperty("entrance_code").ValueKind);
        Assert.Equal(JsonValueKind.Null, addresses[1].GetProperty("entrance").ValueKind);
        Assert.Equal(JsonValueKind.Null, addresses[1].GetProperty("apartment").ValueKind);
    }

    private static async Task UpdateSubscriptionFixtureAsync(NpgsqlDataSource dataSource, Guid customerId, string status)
    {
        await using var command = dataSource.CreateCommand(
            "UPDATE customers SET subscription_status = $2::subscription_status, subscription_start_date = CURRENT_DATE - 30, subscription_end_date = CURRENT_DATE + 30, subscription_auto_renew = $2 = 'active' WHERE id = $1");
        command.Parameters.AddWithValue(customerId);
        command.Parameters.AddWithValue(status);
        Assert.Equal(1, await command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken));
    }

    private static async Task<HttpResponseMessage> AuthorizedGetAsync(HttpClient client, string path, string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await client.SendAsync(request, TestContext.Current.CancellationToken);
    }

    private static async Task<HttpResponseMessage> MalformedAuthorizationGetAsync(HttpClient client, string path)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.TryAddWithoutValidation("Authorization", "Token malformed");
        return await client.SendAsync(request, TestContext.Current.CancellationToken);
    }

    private static string CreateTestToken(Guid userId, string role, DateTimeOffset expiresAt)
    {
        var header = Base64Url(Encoding.UTF8.GetBytes("{\"alg\":\"HS256\",\"typ\":\"JWT\"}"));
        var payload = Base64Url(JsonSerializer.SerializeToUtf8Bytes(new
        {
            id = userId.ToString(),
            role,
            iat = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            exp = expiresAt.ToUnixTimeSeconds(),
        }));
        var signingInput = $"{header}.{payload}";
        var signature = Base64Url(HMACSHA256.HashData(Encoding.UTF8.GetBytes(TestJwtSecret), Encoding.UTF8.GetBytes(signingInput)));
        return $"{signingInput}.{signature}";
    }

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static async Task AssertEquivalentAsync(HttpResponseMessage node, HttpResponseMessage dotnet)
    {
        Assert.Equal(node.StatusCode, dotnet.StatusCode);
        Assert.Equal("application/json", node.Content.Headers.ContentType?.MediaType);
        Assert.Equal("application/json", dotnet.Content.Headers.ContentType?.MediaType);
        using var nodePayload = JsonDocument.Parse(await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        using var dotnetPayload = JsonDocument.Parse(await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        AssertEquivalentElement(nodePayload.RootElement, dotnetPayload.RootElement, null);
    }

    private static void AssertEquivalentElement(JsonElement node, JsonElement dotnet, string? propertyName)
    {
        Assert.Equal(node.ValueKind, dotnet.ValueKind);
        if (propertyName is "created_at")
        {
            return;
        }

        switch (node.ValueKind)
        {
            case JsonValueKind.Object:
                Assert.Equal(
                    node.EnumerateObject().Select(property => property.Name).Order(),
                    dotnet.EnumerateObject().Select(property => property.Name).Order());
                foreach (var property in node.EnumerateObject())
                {
                    AssertEquivalentElement(property.Value, dotnet.GetProperty(property.Name), property.Name);
                }

                break;
            case JsonValueKind.Array:
                Assert.Equal(node.GetArrayLength(), dotnet.GetArrayLength());
                for (var index = 0; index < node.GetArrayLength(); index++)
                {
                    AssertEquivalentElement(node[index], dotnet[index], propertyName);
                }

                break;
            case JsonValueKind.String:
                Assert.Equal(node.GetString(), dotnet.GetString());
                break;
            case JsonValueKind.Number:
                Assert.Equal(node.GetRawText(), dotnet.GetRawText());
                break;
            case JsonValueKind.True:
            case JsonValueKind.False:
            case JsonValueKind.Null:
                break;
            default:
                throw new InvalidOperationException($"Unsupported JSON value kind {node.ValueKind}.");
        }
    }

    private static string GetConnectionStringOrSkip()
    {
        var connectionString = Environment.GetEnvironmentVariable("KOZ_NET2A_TEST_CONNECTION_STRING");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw SkipException.ForSkip("Set KOZ_NET2A_TEST_CONNECTION_STRING to run NET-2A public read integration tests.");
        }

        Assert.Equal(TestDatabaseName, new NpgsqlConnectionStringBuilder(connectionString).Database);
        return connectionString;
    }

    private sealed record TestCustomer(string Token, Guid CustomerId);
    private sealed record CatalogFixture(Guid VisibleFallback, Guid VisibleOverride, Guid Inactive, Guid Hidden, Guid OutOfStock, Guid WithoutInventory);
}
