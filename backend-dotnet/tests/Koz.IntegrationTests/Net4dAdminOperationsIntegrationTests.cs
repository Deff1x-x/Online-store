using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
using Xunit;
using Xunit.Sdk;

namespace Koz.IntegrationTests;

[Collection("NodeApi")]
public sealed class Net4dAdminOperationsIntegrationTests
{
    [Fact, Trait("Category", "Integration")]
    public async Task AdminOperationsReadContracts_NodeParity()
    {
        await using var scope = await Scope.OpenAsync();
        var token = await scope.TokenAsync();
        foreach (var path in new[]
        {
            "/api/admin/operations/orders?page=1&limit=20",
            "/api/admin/operations/orders/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            "/api/admin/operations/payments?page=1&limit=20",
            "/api/admin/operations/analytics/revenue",
            "/api/admin/operations/analytics/delivery",
            "/api/admin/operations/stores/11111111-1111-1111-1111-111111111111/report",
            "/api/admin/operations/promo-codes/99999999-9999-9999-9999-999999999999/usage",
            "/api/admin/operations/first-order-discounts",
        })
        {
            await SameAsync(await scope.GetAsync(scope.Node.Client, path, token), await scope.GetAsync(scope.Dotnet, path, token));
        }

        await SameAsync(await scope.PostAsync(scope.Node.Client, "/api/admin/operations/export/orders", null, token),
            await scope.PostAsync(scope.Dotnet, "/api/admin/operations/export/orders", null, token), ignoreGeneratedAt: true);
    }

    [Fact, Trait("Category", "Integration")]
    public async Task AdminOperationsFiltersErrorsAndRbac_NodeParity()
    {
        await using var scope = await Scope.OpenAsync();
        var admin = await scope.TokenAsync();
        foreach (var path in new[]
        {
            "/api/admin/operations/orders?store_id=11111111-1111-1111-1111-111111111111&status=new&date_from=2020-01-01&date_to=2100-01-01",
            "/api/admin/operations/payments?method=online&status=completed",
            "/api/admin/operations/orders/not-a-uuid",
            "/api/admin/operations/stores/not-a-uuid/report",
        }) await SameAsync(await scope.GetAsync(scope.Node.Client, path, admin), await scope.GetAsync(scope.Dotnet, path, admin));

        foreach (var email in new[] { "manager@koz.kz", "catalog@koz.kz", "customers@koz.kz" })
        {
            var token = await scope.TokenAsync(email);
            await SameAsync(await scope.GetAsync(scope.Node.Client, "/api/admin/operations/orders", token), await scope.GetAsync(scope.Dotnet, "/api/admin/operations/orders", token));
        }
        var missing = await scope.GetAsync(scope.Dotnet, "/api/admin/operations/orders", null);
        Assert.Equal(HttpStatusCode.Unauthorized, missing.StatusCode);
    }

    [Fact, Trait("Category", "Integration")]
    public async Task AdminOperationsStatusSideEffectsAndConcurrency()
    {
        await using var scope = await Scope.OpenAsync();
        var token = await scope.TokenAsync();
        for (var run = 0; run < 5; run++)
        {
            var orderId = await scope.CreateOrderAsync("new", 0m);
            var before = await scope.InventoryAsync();
            var statuses = await ParallelAsync(() => scope.PutAsync(scope.Dotnet, $"/api/admin/operations/orders/{orderId}/status", new { delivery_status = "cancelled" }, token));
            Assert.Equal(new[] { HttpStatusCode.OK, HttpStatusCode.BadRequest }, statuses);
            Assert.Equal(before + 1m, await scope.InventoryAsync());
            Assert.Equal("cancelled", await scope.OrderStatusAsync(orderId));

            var delivered = await scope.CreateOrderAsync("in_delivery", 20m);
            using var response = await scope.PutAsync(scope.Dotnet, $"/api/admin/operations/orders/{delivered}/status", new { delivery_status = "delivered" }, token);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal(1, await scope.PosPaymentCountAsync(delivered));
        }
    }

    private static async Task<HttpStatusCode[]> ParallelAsync(Func<Task<HttpResponseMessage>> send)
    {
        using var barrier = new Barrier(2);
        var tasks = Enumerable.Range(0, 2).Select(_ => Task.Run(async () =>
        {
            barrier.SignalAndWait();
            using var response = await send();
            return response.StatusCode;
        }));
        return (await Task.WhenAll(tasks)).Order().ToArray();
    }

    private static async Task SameAsync(HttpResponseMessage node, HttpResponseMessage dotnet, bool ignoreGeneratedAt = false)
    {
        var nodeText = await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        var dotnetText = await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.True(node.StatusCode == dotnet.StatusCode, $"Node {(int)node.StatusCode}: {nodeText}; .NET {(int)dotnet.StatusCode}: {dotnetText}");
        Assert.Equal(node.Content.Headers.ContentType?.MediaType, dotnet.Content.Headers.ContentType?.MediaType);
        node.Dispose(); dotnet.Dispose();
        if (!ignoreGeneratedAt) Assert.Equal(nodeText, dotnetText);
        else
        {
            using var nodeJson = JsonDocument.Parse(nodeText);
            using var dotnetJson = JsonDocument.Parse(dotnetText);
            Assert.Equal(nodeJson.RootElement.GetProperty("message").GetString(), dotnetJson.RootElement.GetProperty("message").GetString());
            Assert.Equal(nodeJson.RootElement.GetProperty("format").GetString(), dotnetJson.RootElement.GetProperty("format").GetString());
            Assert.Equal(nodeJson.RootElement.GetProperty("rows").GetRawText(), dotnetJson.RootElement.GetProperty("rows").GetRawText());
        }
    }

    private sealed class Scope : IAsyncDisposable
    {
        private readonly Net1ApiFactory factory;
        private readonly string connectionString;
        private Scope(Net1ApiFactory factory, HttpClient dotnet, NodeAuthServer node, string connectionString)
        { this.factory = factory; Dotnet = dotnet; Node = node; this.connectionString = connectionString; }
        public HttpClient Dotnet { get; }
        public NodeAuthServer Node { get; }
        public static async Task<Scope> OpenAsync()
        {
            var cs = Environment.GetEnvironmentVariable("KOZ_NET4D_TEST_CONNECTION_STRING");
            if (string.IsNullOrWhiteSpace(cs)) throw SkipException.ForSkip("Set KOZ_NET4D_TEST_CONNECTION_STRING.");
            Assert.Equal("koz_dotnet_net4d_test", new NpgsqlConnectionStringBuilder(cs).Database);
            var factory = new Net1ApiFactory(cs);
            return new Scope(factory, factory.CreateClient(), await NodeAuthServer.StartAsync(cs, TestContext.Current.CancellationToken), cs);
        }
        public async Task<string> TokenAsync(string email = "admin@koz.kz")
        {
            using var response = await Dotnet.PostAsJsonAsync("/api/auth/staff/login", new { email, password = "Manager123" }, TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
            return json.RootElement.GetProperty("token").GetString()!;
        }
        public Task<HttpResponseMessage> GetAsync(HttpClient client, string path, string? token)
        {
            var request = new HttpRequestMessage(HttpMethod.Get, path);
            if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return client.SendAsync(request, TestContext.Current.CancellationToken);
        }
        public Task<HttpResponseMessage> PostAsync(HttpClient client, string path, object? body, string token)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, path);
            if (body is not null) request.Content = JsonContent.Create(body);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return client.SendAsync(request, TestContext.Current.CancellationToken);
        }
        public Task<HttpResponseMessage> PutAsync(HttpClient client, string path, object body, string token)
        {
            var request = new HttpRequestMessage(HttpMethod.Put, path) { Content = JsonContent.Create(body) };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return client.SendAsync(request, TestContext.Current.CancellationToken);
        }
        public async Task<Guid> CreateOrderAsync(string status, decimal posTopup)
        {
            var id = Guid.NewGuid();
            await using var data = NpgsqlDataSource.Create(connectionString);
            await using var command = data.CreateCommand("""
                INSERT INTO orders(id,order_number,store_id,customer_id,subtotal,delivery_fee,final_total,total_price,pos_terminal_topup,fulfillment_window,delivery_status,payment_status)
                VALUES($1,$2,'11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',10,0,10,10,$3,'same_day',$4::delivery_status,'pending')
                """);
            command.Parameters.AddWithValue(id); command.Parameters.AddWithValue("NET4D-" + id.ToString("N")); command.Parameters.AddWithValue(posTopup); command.Parameters.AddWithValue(status);
            await command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
            await using var item = data.CreateCommand("INSERT INTO order_items(order_id,product_id,quantity,price_per_unit,line_total) VALUES($1,'55555555-5555-5555-5555-555555555555',1,10,10)");
            item.Parameters.AddWithValue(id);
            await item.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
            await using var inventory = data.CreateCommand("INSERT INTO store_inventory(store_id,product_id,quantity,stock_quantity,status) VALUES('11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555',0,0,'out_of_stock') ON CONFLICT(store_id,product_id) DO NOTHING");
            await inventory.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
            return id;
        }
        public async Task<decimal> InventoryAsync()
        { await using var data = NpgsqlDataSource.Create(connectionString); return Convert.ToDecimal(await data.CreateCommand("SELECT quantity FROM store_inventory WHERE store_id='11111111-1111-1111-1111-111111111111' AND product_id='55555555-5555-5555-5555-555555555555'").ExecuteScalarAsync(TestContext.Current.CancellationToken)); }
        public async Task<string> OrderStatusAsync(Guid id)
        { await using var data = NpgsqlDataSource.Create(connectionString); var command=data.CreateCommand("SELECT delivery_status::text FROM orders WHERE id=$1"); command.Parameters.AddWithValue(id); return (string)(await command.ExecuteScalarAsync(TestContext.Current.CancellationToken))!; }
        public async Task<int> PosPaymentCountAsync(Guid id)
        { await using var data = NpgsqlDataSource.Create(connectionString); var command=data.CreateCommand("SELECT COUNT(*) FROM payments WHERE order_id=$1 AND method='pos_terminal'"); command.Parameters.AddWithValue(id); return Convert.ToInt32(await command.ExecuteScalarAsync(TestContext.Current.CancellationToken)); }
        public ValueTask DisposeAsync() { Node.Dispose(); Dotnet.Dispose(); factory.Dispose(); return ValueTask.CompletedTask; }
    }
}
