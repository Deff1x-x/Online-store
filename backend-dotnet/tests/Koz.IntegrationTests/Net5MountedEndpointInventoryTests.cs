using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
using Xunit;
using Xunit.Sdk;

namespace Koz.IntegrationTests;

/// <summary>
/// Confirms every mounted Node route from src/app.js has a .NET handler (not route_not_found).
/// </summary>
[Collection("NodeApi")]
public sealed class Net5MountedEndpointInventoryTests
{
    [Fact, Trait("Category", "Integration")]
    public async Task EveryMountedNodeEndpoint_IsImplementedInDotnet()
    {
        await using var scope = await Scope.OpenAsync();
        var catalog = await scope.TokenAsync("catalog@koz.kz");
        var operations = await scope.TokenAsync("admin@koz.kz");
        var customers = await scope.TokenAsync("customers@koz.kz");
        var manager = await scope.TokenAsync("manager@koz.kz");
        var customerLogin = await scope.Dotnet.PostAsJsonAsync("/api/auth/login", new { phone = "+77010000001", code = "000000" }, TestContext.Current.CancellationToken);
        string? customerToken = null;
        if (customerLogin.IsSuccessStatusCode)
        {
            using var json = JsonDocument.Parse(await customerLogin.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
            customerToken = json.RootElement.GetProperty("token").GetString();
        }

        var store = "11111111-1111-1111-1111-111111111111";
        var product = "33333333-3333-3333-3333-333333333333";
        var order = "00000000-0000-0000-0000-000000000001";
        var customer = "22222222-2222-2222-2222-222222222222";

        var mounted = new List<(HttpMethod Method, string Path, string? Token)>
        {
            (HttpMethod.Get, "/api/health", null),
            (HttpMethod.Post, "/api/auth/otp", null),
            (HttpMethod.Post, "/api/auth/register", null),
            (HttpMethod.Post, "/api/auth/login", null),
            (HttpMethod.Post, "/api/auth/staff/login", null),
            (HttpMethod.Post, "/api/auth/refresh", null),
            (HttpMethod.Get, $"/api/products/store/{store}", null),
            (HttpMethod.Post, "/api/products", catalog),
            (HttpMethod.Post, "/api/products/link-store", catalog),
            (HttpMethod.Get, "/api/my-profile", customerToken),
            (HttpMethod.Put, "/api/my-profile", customerToken),
            (HttpMethod.Get, "/api/my-addresses", customerToken),
            (HttpMethod.Post, "/api/my-addresses", customerToken),
            (HttpMethod.Delete, $"/api/my-addresses/{Guid.NewGuid()}", customerToken),
            (HttpMethod.Get, "/api/subscriptions", catalog),
            (HttpMethod.Post, "/api/subscriptions", customerToken),
            (HttpMethod.Post, $"/api/subscriptions/{customer}/renew", customers),
            (HttpMethod.Post, $"/api/subscriptions/{customer}/cancel", catalog),
            (HttpMethod.Post, "/api/promocodes/validate", customerToken),
            (HttpMethod.Get, "/api/promocodes", catalog),
            (HttpMethod.Post, "/api/promocodes", catalog),
            (HttpMethod.Post, "/api/orders", customerToken),
            (HttpMethod.Get, "/api/my-orders", customerToken),
            (HttpMethod.Get, $"/api/my-orders/{order}", customerToken),
            (HttpMethod.Get, "/api/payments", operations),
            (HttpMethod.Get, $"/api/payments/{Guid.NewGuid()}", operations),
            (HttpMethod.Post, $"/api/payments/orders/{order}/pay-online", customerToken),
            (HttpMethod.Get, "/api/my-store/orders", manager),
            (HttpMethod.Put, $"/api/my-store/orders/{order}/pick", manager),
            (HttpMethod.Put, $"/api/my-store/orders/{order}/actual-weight", manager),
            (HttpMethod.Put, $"/api/my-store/orders/{order}/status", manager),
            (HttpMethod.Get, "/api/my-store/inventory", manager),
            (HttpMethod.Put, $"/api/my-store/inventory/{product}", manager),
            (HttpMethod.Post, $"/api/my-store/inventory/{product}/incoming", manager),
            (HttpMethod.Get, "/api/my-store/analytics", manager),
            (HttpMethod.Post, "/api/notifications/sms", operations),
            (HttpMethod.Post, "/api/notifications/email", operations),
            (HttpMethod.Get, "/api/admin/catalog/stores", catalog),
            (HttpMethod.Post, "/api/admin/catalog/stores", catalog),
            (HttpMethod.Put, $"/api/admin/catalog/stores/{store}", catalog),
            (HttpMethod.Delete, $"/api/admin/catalog/stores/{store}", catalog),
            (HttpMethod.Post, "/api/admin/catalog/coverage", catalog),
            (HttpMethod.Get, "/api/admin/catalog/products", catalog),
            (HttpMethod.Post, "/api/admin/catalog/products", catalog),
            (HttpMethod.Put, $"/api/admin/catalog/products/{product}", catalog),
            (HttpMethod.Delete, $"/api/admin/catalog/products/{product}", catalog),
            (HttpMethod.Get, $"/api/admin/catalog/stores/{store}/inventory", catalog),
            (HttpMethod.Put, $"/api/admin/catalog/stores/{store}/inventory/{product}", catalog),
            (HttpMethod.Post, $"/api/admin/catalog/stores/{store}/inventory/{product}/incoming", catalog),
            (HttpMethod.Get, "/api/admin/catalog/promo-codes", catalog),
            (HttpMethod.Post, "/api/admin/catalog/promo-codes", catalog),
            (HttpMethod.Put, $"/api/admin/catalog/promo-codes/{Guid.NewGuid()}", catalog),
            (HttpMethod.Delete, $"/api/admin/catalog/promo-codes/{Guid.NewGuid()}", catalog),
            (HttpMethod.Get, $"/api/admin/catalog/delivery-settings/{store}", catalog),
            (HttpMethod.Put, $"/api/admin/catalog/delivery-settings/{store}", catalog),
            (HttpMethod.Get, "/api/admin/customers/customers", customers),
            (HttpMethod.Get, $"/api/admin/customers/customers/{customer}", customers),
            (HttpMethod.Put, $"/api/admin/customers/customers/{customer}/subscription/renew", customers),
            (HttpMethod.Put, $"/api/admin/customers/customers/{customer}/subscription/pause", customers),
            (HttpMethod.Put, $"/api/admin/customers/customers/{customer}/subscription/cancel", customers),
            (HttpMethod.Get, "/api/admin/customers/subscriptions", customers),
            (HttpMethod.Get, "/api/admin/customers/audit-logs/consents", customers),
            (HttpMethod.Post, "/api/admin/customers/export/customers", customers),
            (HttpMethod.Get, "/api/admin/operations/orders", operations),
            (HttpMethod.Get, $"/api/admin/operations/orders/{order}", operations),
            (HttpMethod.Put, $"/api/admin/operations/orders/{order}/status", operations),
            (HttpMethod.Get, "/api/admin/operations/payments", operations),
            (HttpMethod.Get, "/api/admin/operations/analytics/revenue", operations),
            (HttpMethod.Get, "/api/admin/operations/analytics/delivery", operations),
            (HttpMethod.Get, $"/api/admin/operations/stores/{store}/report", operations),
            (HttpMethod.Post, "/api/admin/operations/export/orders", operations),
            (HttpMethod.Get, $"/api/admin/operations/promo-codes/{Guid.NewGuid()}/usage", operations),
            (HttpMethod.Get, "/api/admin/operations/first-order-discounts", operations),
            (HttpMethod.Post, "/api/webhooks/kaspi", null),
        };

        var missing = new List<string>();
        foreach (var endpoint in mounted)
        {
            if (endpoint.Token is null && endpoint.Path.StartsWith("/api/my-", StringComparison.Ordinal))
                continue;
            if (endpoint.Token is null && endpoint.Path is "/api/orders" or "/api/promocodes/validate" or "/api/subscriptions" && endpoint.Method == HttpMethod.Post)
                continue;

            using var response = await scope.Send(scope.Dotnet, endpoint.Method, endpoint.Path, endpoint.Token, new { });
            var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
            if (response.StatusCode == HttpStatusCode.NotFound && body.Contains("route_not_found", StringComparison.Ordinal))
                missing.Add($"{endpoint.Method} {endpoint.Path}");
        }

        Assert.True(missing.Count == 0, "Mounted Node endpoints missing in .NET:\n" + string.Join("\n", missing));
    }

    private sealed class Scope : IAsyncDisposable
    {
        private readonly Net1ApiFactory factory;
        private Scope(Net1ApiFactory factory, HttpClient dotnet, NodeAuthServer node)
        {
            this.factory = factory;
            Dotnet = dotnet;
            Node = node;
        }

        public HttpClient Dotnet { get; }
        public NodeAuthServer Node { get; }

        public static async Task<Scope> OpenAsync()
        {
            var cs = Environment.GetEnvironmentVariable("KOZ_NET5_TEST_CONNECTION_STRING");
            if (string.IsNullOrWhiteSpace(cs))
                throw SkipException.ForSkip("Set KOZ_NET5_TEST_CONNECTION_STRING.");
            Assert.Equal("koz_dotnet_net5_test", new NpgsqlConnectionStringBuilder(cs).Database);
            var f = new Net1ApiFactory(cs);
            return new(f, f.CreateClient(), await NodeAuthServer.StartAsync(cs, TestContext.Current.CancellationToken));
        }

        public async Task<string> TokenAsync(string email)
        {
            var response = await Dotnet.PostAsJsonAsync("/api/auth/staff/login", new { email, password = "Manager123" }, TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
            return json.RootElement.GetProperty("token").GetString()!;
        }

        public Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, string? token, object body)
        {
            var request = new HttpRequestMessage(method, path);
            if (token is not null)
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (method != HttpMethod.Get && method != HttpMethod.Delete)
                request.Content = JsonContent.Create(body);
            return client.SendAsync(request, TestContext.Current.CancellationToken);
        }

        public ValueTask DisposeAsync()
        {
            Node.Dispose();
            Dotnet.Dispose();
            factory.Dispose();
            return ValueTask.CompletedTask;
        }
    }
}
