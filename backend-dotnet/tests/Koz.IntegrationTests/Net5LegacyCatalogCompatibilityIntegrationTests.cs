using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
using Xunit;
using Xunit.Sdk;

namespace Koz.IntegrationTests;

[Collection("NodeApi")]
public sealed class Net5LegacyCatalogCompatibilityIntegrationTests
{
    private const string StoreId = "11111111-1111-1111-1111-111111111111";
    private const string ProductId = "33333333-3333-3333-3333-333333333333";

    [Fact, Trait("Category", "Integration")]
    public async Task CreateProduct_LinkStore_Promocodes_NodeParity()
    {
        await using var scope = await Scope.OpenAsync();
        var token = await scope.TokenAsync();

        await SameAsync(
            await scope.Get(scope.Node.Client, "/api/promocodes", token),
            await scope.Get(scope.Dotnet, "/api/promocodes", token));
        await SameAsync(
            await scope.Get(scope.Node.Client, $"/api/promocodes?store_id={StoreId}", token),
            await scope.Get(scope.Dotnet, $"/api/promocodes?store_id={StoreId}", token));

        var suffix = Guid.NewGuid().ToString("N");
        var nodeCreate = await scope.Post(scope.Node.Client, "/api/products", new
        {
            name = "net5-" + suffix,
            category = "dairy",
            unit = "pcs",
            price_per_unit = 12.5,
            company_price = 10,
            is_weighted = false,
        }, token);
        var dotnetCreate = await scope.Post(scope.Dotnet, "/api/products", new
        {
            name = "dotnet-" + suffix,
            category = "dairy",
            unit = "pcs",
            price_per_unit = 12.5,
            company_price = 10,
            is_weighted = false,
        }, token);
        Assert.Equal(nodeCreate.StatusCode, dotnetCreate.StatusCode);
        Assert.Equal(HttpStatusCode.Created, nodeCreate.StatusCode);
        using var nodeCreateJson = JsonDocument.Parse(await nodeCreate.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        using var dotnetCreateJson = JsonDocument.Parse(await dotnetCreate.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal(
            nodeCreateJson.RootElement.EnumerateObject().Select(x => x.Name),
            dotnetCreateJson.RootElement.EnumerateObject().Select(x => x.Name));
        Assert.Equal(
            nodeCreateJson.RootElement.GetProperty("product").EnumerateObject().Select(x => x.Name),
            dotnetCreateJson.RootElement.GetProperty("product").EnumerateObject().Select(x => x.Name));
        Assert.Equal(
            nodeCreateJson.RootElement.GetProperty("product").GetProperty("price_per_unit").GetRawText(),
            dotnetCreateJson.RootElement.GetProperty("product").GetProperty("price_per_unit").GetRawText());
        Assert.Equal(
            nodeCreateJson.RootElement.GetProperty("product").GetProperty("company_price").ValueKind,
            dotnetCreateJson.RootElement.GetProperty("product").GetProperty("company_price").ValueKind);

        var nodeProductId = nodeCreateJson.RootElement.GetProperty("product").GetProperty("id").GetString()!;
        var dotnetProductId = dotnetCreateJson.RootElement.GetProperty("product").GetProperty("id").GetString()!;

        var linkCreate = new { store_id = StoreId, product_id = nodeProductId, quantity = 4.2, selling_price = 15.5 };
        var linkCreateDotnet = new { store_id = StoreId, product_id = dotnetProductId, quantity = 4.2, selling_price = 15.5 };
        var nodeLink = await scope.Post(scope.Node.Client, "/api/products/link-store", linkCreate, token);
        var dotnetLink = await scope.Post(scope.Dotnet, "/api/products/link-store", linkCreateDotnet, token);
        Assert.Equal(nodeLink.StatusCode, dotnetLink.StatusCode);
        Assert.Equal(HttpStatusCode.Created, nodeLink.StatusCode);
        using var nodeLinkJson = JsonDocument.Parse(await nodeLink.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        using var dotnetLinkJson = JsonDocument.Parse(await dotnetLink.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal(
            nodeLinkJson.RootElement.EnumerateObject().Select(x => x.Name),
            dotnetLinkJson.RootElement.EnumerateObject().Select(x => x.Name));
        Assert.Equal(
            nodeLinkJson.RootElement.GetProperty("inventory").EnumerateObject().Select(x => x.Name),
            dotnetLinkJson.RootElement.GetProperty("inventory").EnumerateObject().Select(x => x.Name));
        Assert.Equal(
            nodeLinkJson.RootElement.GetProperty("inventory").GetProperty("quantity").GetRawText(),
            dotnetLinkJson.RootElement.GetProperty("inventory").GetProperty("quantity").GetRawText());
        Assert.Equal(
            nodeLinkJson.RootElement.GetProperty("inventory").GetProperty("stock_quantity").GetInt32(),
            dotnetLinkJson.RootElement.GetProperty("inventory").GetProperty("stock_quantity").GetInt32());
        Assert.Equal(
            nodeLinkJson.RootElement.GetProperty("inventory").GetProperty("status").GetString(),
            dotnetLinkJson.RootElement.GetProperty("inventory").GetProperty("status").GetString());
        Assert.Equal(
            nodeLinkJson.RootElement.GetProperty("inventory").GetProperty("last_delivery_date").GetRawText(),
            dotnetLinkJson.RootElement.GetProperty("inventory").GetProperty("last_delivery_date").GetRawText());

        var linkUpdate = new { store_id = StoreId, product_id = nodeProductId, quantity = 1, selling_price = (decimal?)null };
        var linkUpdateDotnet = new { store_id = StoreId, product_id = dotnetProductId, quantity = 1, selling_price = (decimal?)null };
        var nodeUpdate = await scope.Post(scope.Node.Client, "/api/products/link-store", linkUpdate, token);
        var dotnetUpdate = await scope.Post(scope.Dotnet, "/api/products/link-store", linkUpdateDotnet, token);
        Assert.Equal(nodeUpdate.StatusCode, dotnetUpdate.StatusCode);
        Assert.Equal(HttpStatusCode.OK, nodeUpdate.StatusCode);
        using var nodeUpdateJson = JsonDocument.Parse(await nodeUpdate.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        using var dotnetUpdateJson = JsonDocument.Parse(await dotnetUpdate.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal("low_stock", nodeUpdateJson.RootElement.GetProperty("inventory").GetProperty("status").GetString());
        Assert.Equal("low_stock", dotnetUpdateJson.RootElement.GetProperty("inventory").GetProperty("status").GetString());

        var nodeCode = "N5" + suffix[..10].ToUpperInvariant();
        var dotnetCode = "D5" + suffix[..10].ToUpperInvariant();
        var nodePromo = await scope.Post(scope.Node.Client, "/api/promocodes", new { code = nodeCode, discount_type = "fixed_amount", discount_value = 50, store_id = StoreId }, token);
        var dotnetPromo = await scope.Post(scope.Dotnet, "/api/promocodes", new { code = dotnetCode, discount_type = "fixed_amount", discount_value = 50, store_id = StoreId }, token);
        Assert.Equal(nodePromo.StatusCode, dotnetPromo.StatusCode);
        Assert.Equal(HttpStatusCode.Created, nodePromo.StatusCode);
        using var nodePromoJson = JsonDocument.Parse(await nodePromo.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        using var dotnetPromoJson = JsonDocument.Parse(await dotnetPromo.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal(
            nodePromoJson.RootElement.GetProperty("promo_code").EnumerateObject().Select(x => x.Name),
            dotnetPromoJson.RootElement.GetProperty("promo_code").EnumerateObject().Select(x => x.Name));
        Assert.Equal(
            nodePromoJson.RootElement.GetProperty("promo_code").GetProperty("discount_value").GetRawText(),
            dotnetPromoJson.RootElement.GetProperty("promo_code").GetProperty("discount_value").GetRawText());

        await SameAsync(
            await scope.Post(scope.Node.Client, "/api/promocodes", new { code = nodeCode, discount_type = "fixed_amount", discount_value = 50, store_id = StoreId }, token),
            await scope.Post(scope.Dotnet, "/api/promocodes", new { code = dotnetCode, discount_type = "fixed_amount", discount_value = 50, store_id = StoreId }, token));
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Validation_Authorization_And_ErrorParity()
    {
        await using var scope = await Scope.OpenAsync();
        var catalog = await scope.TokenAsync();
        var manager = await scope.TokenAsync("manager@koz.kz");
        var customer = await scope.TokenAsync("customers@koz.kz");

        foreach (var path in new[] { "/api/products", "/api/products/link-store", "/api/promocodes" })
        {
            await SameAsync(await scope.GetUnauth(scope.Node.Client, path), await scope.GetUnauth(scope.Dotnet, path));
            await SameAsync(await scope.Post(scope.Node.Client, path, new { }, manager), await scope.Post(scope.Dotnet, path, new { }, manager));
            await SameAsync(await scope.Post(scope.Node.Client, path, new { }, customer), await scope.Post(scope.Dotnet, path, new { }, customer));
        }

        await SameAsync(
            await scope.Post(scope.Node.Client, "/api/products", new { name = "", category = "nope", unit = "bad", price_per_unit = -1, company_price = -1, is_weighted = "no" }, catalog),
            await scope.Post(scope.Dotnet, "/api/products", new { name = "", category = "nope", unit = "bad", price_per_unit = -1, company_price = -1, is_weighted = "no" }, catalog));

        await SameAsync(
            await scope.Post(scope.Node.Client, "/api/products", new { name = "x", category = "", unit = "pcs", price_per_unit = 1, company_price = 1, is_weighted = false }, catalog),
            await scope.Post(scope.Dotnet, "/api/products", new { name = "x", category = "", unit = "pcs", price_per_unit = 1, company_price = 1, is_weighted = false }, catalog));

        await SameAsync(
            await scope.Post(scope.Node.Client, "/api/products", new { name = "x", category = "dairy", unit = "pcs", price_per_unit = 1, company_price = 1 }, catalog),
            await scope.Post(scope.Dotnet, "/api/products", new { name = "x", category = "dairy", unit = "pcs", price_per_unit = 1, company_price = 1 }, catalog));

        await SameAsync(
            await scope.Post(scope.Node.Client, "/api/products/link-store", new { store_id = "not-a-uuid", product_id = ProductId, quantity = 1 }, catalog),
            await scope.Post(scope.Dotnet, "/api/products/link-store", new { store_id = "not-a-uuid", product_id = ProductId, quantity = 1 }, catalog));

        await SameAsync(
            await scope.Post(scope.Node.Client, "/api/products/link-store", new { store_id = StoreId, product_id = Guid.NewGuid(), quantity = 1 }, catalog),
            await scope.Post(scope.Dotnet, "/api/products/link-store", new { store_id = StoreId, product_id = Guid.NewGuid(), quantity = 1 }, catalog));

        await SameAsync(
            await scope.Post(scope.Node.Client, "/api/promocodes", new { code = "", discount_type = "wrong", discount_value = -1, is_active = "yes" }, catalog),
            await scope.Post(scope.Dotnet, "/api/promocodes", new { code = "", discount_type = "wrong", discount_value = -1, is_active = "yes" }, catalog));

        await SameAsync(
            await scope.Post(scope.Node.Client, "/api/promocodes", new { code = "OK", discount_type = "percentage", discount_value = 10, store_id = "not-a-uuid" }, catalog),
            await scope.Post(scope.Dotnet, "/api/promocodes", new { code = "OK", discount_type = "percentage", discount_value = 10, store_id = "not-a-uuid" }, catalog));
    }

    [Fact, Trait("Category", "Integration")]
    public async Task CategoryAliases_And_OutOfStockLinkParity()
    {
        await using var scope = await Scope.OpenAsync();
        var token = await scope.TokenAsync();
        var suffix = Guid.NewGuid().ToString("N");

        var node = await scope.Post(scope.Node.Client, "/api/products", new { name = "fruit-node-" + suffix, category = "fruit", unit = "KG", price_per_unit = 3, company_price = 2, is_weighted = true, is_active = true }, token);
        var dotnet = await scope.Post(scope.Dotnet, "/api/products", new { name = "fruit-dotnet-" + suffix, category = "fruit", unit = "KG", price_per_unit = 3, company_price = 2, is_weighted = true, is_active = true }, token);
        Assert.Equal(node.StatusCode, dotnet.StatusCode);
        using var nj = JsonDocument.Parse(await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        using var dj = JsonDocument.Parse(await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal("fruits", nj.RootElement.GetProperty("product").GetProperty("category").GetString());
        Assert.Equal("fruits", dj.RootElement.GetProperty("product").GetProperty("category").GetString());
        Assert.Equal("kg", nj.RootElement.GetProperty("product").GetProperty("unit").GetString());
        Assert.Equal("kg", dj.RootElement.GetProperty("product").GetProperty("unit").GetString());

        var nodeId = nj.RootElement.GetProperty("product").GetProperty("id").GetString()!;
        var dotnetId = dj.RootElement.GetProperty("product").GetProperty("id").GetString()!;
        var nodeLink = await scope.Post(scope.Node.Client, "/api/products/link-store", new { store_id = StoreId, product_id = nodeId, quantity = 0 }, token);
        var dotnetLink = await scope.Post(scope.Dotnet, "/api/products/link-store", new { store_id = StoreId, product_id = dotnetId, quantity = 0 }, token);
        Assert.Equal(nodeLink.StatusCode, dotnetLink.StatusCode);
        using var nl = JsonDocument.Parse(await nodeLink.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        using var dl = JsonDocument.Parse(await dotnetLink.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal("out_of_stock", nl.RootElement.GetProperty("inventory").GetProperty("status").GetString());
        Assert.Equal("out_of_stock", dl.RootElement.GetProperty("inventory").GetProperty("status").GetString());
        Assert.Equal(0, nl.RootElement.GetProperty("inventory").GetProperty("stock_quantity").GetInt32());
        Assert.Equal(0, dl.RootElement.GetProperty("inventory").GetProperty("stock_quantity").GetInt32());
    }

    [Fact, Trait("Category", "Integration")]
    public async Task MountedNodeEndpoints_HaveDotnetHandlers()
    {
        await using var scope = await Scope.OpenAsync();
        var catalog = await scope.TokenAsync();
        var endpoints = new (HttpMethod Method, string Path)[]
        {
            (HttpMethod.Post, "/api/products"),
            (HttpMethod.Post, "/api/products/link-store"),
            (HttpMethod.Get, "/api/promocodes"),
            (HttpMethod.Post, "/api/promocodes"),
        };

        foreach (var endpoint in endpoints)
        {
            using var node = await scope.Send(scope.Node.Client, endpoint.Method, endpoint.Path, catalog, new { });
            using var dotnet = await scope.Send(scope.Dotnet, endpoint.Method, endpoint.Path, catalog, new { });
            Assert.NotEqual(HttpStatusCode.NotFound, node.StatusCode);
            Assert.NotEqual(HttpStatusCode.NotFound, dotnet.StatusCode);
            var nodeBody = await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
            var dotnetBody = await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
            Assert.DoesNotContain("route_not_found", nodeBody);
            Assert.DoesNotContain("route_not_found", dotnetBody);
        }
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
            var cs = Environment.GetEnvironmentVariable("KOZ_NET5_TEST_CONNECTION_STRING");
            if (string.IsNullOrWhiteSpace(cs))
                throw SkipException.ForSkip("Set KOZ_NET5_TEST_CONNECTION_STRING.");
            Assert.Equal("koz_dotnet_net5_test", new NpgsqlConnectionStringBuilder(cs).Database);
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

        public Task<HttpResponseMessage> Get(HttpClient client, string path, string token)
        {
            var request = new HttpRequestMessage(HttpMethod.Get, path);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return client.SendAsync(request, TestContext.Current.CancellationToken);
        }

        public Task<HttpResponseMessage> GetUnauth(HttpClient client, string path) =>
            client.SendAsync(new HttpRequestMessage(HttpMethod.Get, path), TestContext.Current.CancellationToken);

        public Task<HttpResponseMessage> Post(HttpClient client, string path, object body, string token)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return client.SendAsync(request, TestContext.Current.CancellationToken);
        }

        public Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, string token, object? body)
        {
            var request = new HttpRequestMessage(method, path);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (method != HttpMethod.Get && body is not null)
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
