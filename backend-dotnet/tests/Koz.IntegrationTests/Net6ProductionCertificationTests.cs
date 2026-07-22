using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
using Xunit;
using Xunit.Sdk;

namespace Koz.IntegrationTests;

/// <summary>NET-6 certification: route inventory, security matrix, and production-config smoke.</summary>
[Collection("NodeApi")]
public sealed class Net6ProductionCertificationTests
{
    private static readonly (HttpMethod Method, string Path)[] CriticalSurface =
    [
        (HttpMethod.Get, "/api/health"),
        (HttpMethod.Post, "/api/auth/staff/login"),
        (HttpMethod.Get, "/api/products/store/11111111-1111-1111-1111-111111111111"),
        (HttpMethod.Get, "/api/promocodes"),
        (HttpMethod.Post, "/api/products"),
        (HttpMethod.Get, "/api/admin/catalog/stores"),
        (HttpMethod.Get, "/api/admin/customers/customers"),
        (HttpMethod.Get, "/api/admin/operations/orders"),
        (HttpMethod.Get, "/api/my-store/inventory"),
        (HttpMethod.Post, "/api/notifications/sms"),
        (HttpMethod.Post, "/api/webhooks/kaspi"),
    ];

    [Fact, Trait("Category", "Integration")]
    public async Task SecurityMatrix_AnonymousInvalidExpiredWrongRole_Parity()
    {
        await using var scope = await Scope.OpenAsync();
        var catalog = await scope.TokenAsync("catalog@koz.kz");
        var manager = await scope.TokenAsync("manager@koz.kz");
        var expired = CreateExpiredToken();

        foreach (var endpoint in CriticalSurface.Where(x => x.Path is not "/api/health" and not "/api/auth/staff/login"
                     and not "/api/products/store/11111111-1111-1111-1111-111111111111"
                     and not "/api/webhooks/kaspi"))
        {
            await SameAsync(
                await scope.Send(scope.Node.Client, endpoint.Method, endpoint.Path, null, new { }),
                await scope.Send(scope.Dotnet, endpoint.Method, endpoint.Path, null, new { }));
            await SameAsync(
                await scope.Send(scope.Node.Client, endpoint.Method, endpoint.Path, "not-a-jwt", new { }),
                await scope.Send(scope.Dotnet, endpoint.Method, endpoint.Path, "not-a-jwt", new { }));
            await SameAsync(
                await scope.Send(scope.Node.Client, endpoint.Method, endpoint.Path, expired, new { }),
                await scope.Send(scope.Dotnet, endpoint.Method, endpoint.Path, expired, new { }));
        }

        await SameAsync(
            await scope.Send(scope.Node.Client, HttpMethod.Get, "/api/admin/catalog/stores", manager, null),
            await scope.Send(scope.Dotnet, HttpMethod.Get, "/api/admin/catalog/stores", manager, null));
        await SameAsync(
            await scope.Send(scope.Node.Client, HttpMethod.Get, "/api/my-store/inventory", catalog, null),
            await scope.Send(scope.Dotnet, HttpMethod.Get, "/api/my-store/inventory", catalog, null));
    }

    [Fact, Trait("Category", "Integration")]
    public async Task ParallelReads_DoNotFail_OrLeakRouteNotFound()
    {
        await using var scope = await Scope.OpenAsync();
        var token = await scope.TokenAsync();
        var tasks = Enumerable.Range(0, 20).Select(async _ =>
        {
            using var response = await scope.Send(scope.Dotnet, HttpMethod.Get, "/api/admin/catalog/products", token, null);
            var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
            Assert.NotEqual(HttpStatusCode.NotFound, response.StatusCode);
            Assert.DoesNotContain("route_not_found", body);
            Assert.True((int)response.StatusCode < 500, body);
        });
        await Task.WhenAll(tasks);
    }

    [Fact, Trait("Category", "Integration")]
    public async Task HealthAndStaffLogin_FrontendBootstrap_WorksOnDotnet()
    {
        await using var scope = await Scope.OpenAsync();
        using var health = await scope.Dotnet.GetAsync("/api/health", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, health.StatusCode);
        using var healthJson = JsonDocument.Parse(await health.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal("ok", healthJson.RootElement.GetProperty("status").GetString());

        using var login = await scope.Dotnet.PostAsJsonAsync("/api/auth/staff/login", new { email = "catalog@koz.kz", password = "Manager123" }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        using var loginJson = JsonDocument.Parse(await login.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.False(string.IsNullOrWhiteSpace(loginJson.RootElement.GetProperty("token").GetString()));
    }

    private static string CreateExpiredToken()
    {
        // Parity with existing suites: malformed/expired bearer yields invalid_token on both stacks.
        return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImFkbWluX2NhdGFsb2ciLCJleHAiOjE2MDAwMDAwMDB9.signature";
    }

    private static async Task SameAsync(HttpResponseMessage node, HttpResponseMessage dotnet)
    {
        var nodeBody = await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        var dotnetBody = await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.True(node.StatusCode == dotnet.StatusCode, $"Status Node={(int)node.StatusCode} .NET={(int)dotnet.StatusCode}\nNode: {nodeBody}\n.NET: {dotnetBody}");
        Assert.Equal(nodeBody, dotnetBody);
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
            var cs = Environment.GetEnvironmentVariable("KOZ_NET6_TEST_CONNECTION_STRING")
                ?? Environment.GetEnvironmentVariable("KOZ_NET5_TEST_CONNECTION_STRING");
            if (string.IsNullOrWhiteSpace(cs))
                throw SkipException.ForSkip("Set KOZ_NET6_TEST_CONNECTION_STRING or KOZ_NET5_TEST_CONNECTION_STRING.");
            var database = new NpgsqlConnectionStringBuilder(cs).Database;
            Assert.True(database is "koz_dotnet_net6_test" or "koz_dotnet_net5_test", $"Unexpected database {database}");
            var f = new Net1ApiFactory(cs);
            return new(f, f.CreateClient(), await NodeAuthServer.StartAsync(cs, TestContext.Current.CancellationToken));
        }

        public async Task<string> TokenAsync(string email = "catalog@koz.kz")
        {
            var response = await Dotnet.PostAsJsonAsync("/api/auth/staff/login", new { email, password = "Manager123" }, TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
            return json.RootElement.GetProperty("token").GetString()!;
        }

        public Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, string? token, object? body)
        {
            var request = new HttpRequestMessage(method, path);
            if (token is not null)
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (method != HttpMethod.Get && method != HttpMethod.Delete && body is not null)
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
