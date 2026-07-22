using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Npgsql;
using Xunit;
using Xunit.Sdk;

namespace Koz.IntegrationTests;

[Collection("NodeApi")]
public sealed class Net4aManagerInventoryIntegrationTests
{
    private const string StoreId = "11111111-1111-1111-1111-111111111111";
    private const string ProductId = "33333333-3333-3333-3333-333333333333";

    [Fact, Trait("Category", "Integration")]
    public async Task Inventory_list_wrapper_shared_fields_nullable_and_order_match_Node()
    {
        await using var scope = await Scope.OpenAsync();
        var manager = await scope.ManagerTokenAsync();
        await scope.ResetInventoryAsync(quantity: 12.5m, sellingPrice: null, visible: true);

        var node = await scope.GetAsync(scope.Node.Client, "/api/my-store/inventory", manager);
        var dotnet = await scope.GetAsync(scope.Dotnet, "/api/my-store/inventory", manager);
        Assert.Equal(HttpStatusCode.OK, node.StatusCode);
        Assert.Equal(node.StatusCode, dotnet.StatusCode);

        using var n = JsonDocument.Parse(await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        using var d = JsonDocument.Parse(await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal(["inventory"], n.RootElement.EnumerateObject().Select(x => x.Name));
        Assert.Equal(["inventory"], d.RootElement.EnumerateObject().Select(x => x.Name));

        var nodeItems = n.RootElement.GetProperty("inventory").EnumerateArray().ToArray();
        var dotnetItems = d.RootElement.GetProperty("inventory").EnumerateArray().ToArray();
        Assert.Equal(nodeItems.Length, dotnetItems.Length);
        Assert.Equal(
            nodeItems.Select(x => x.GetProperty("product_id").GetString()).ToArray(),
            dotnetItems.Select(x => x.GetProperty("product_id").GetString()).ToArray());

        var milkNode = nodeItems.Single(x => x.GetProperty("product_id").GetString() == ProductId);
        var milkDotnet = dotnetItems.Single(x => x.GetProperty("product_id").GetString() == ProductId);
        foreach (var key in new[] { "product_id", "name", "category", "unit", "is_weighted", "price_per_unit", "selling_price", "effective_price", "quantity", "stock_quantity", "is_visible", "status" })
        {
            Assert.True(milkDotnet.TryGetProperty(key, out _), key);
            Assert.Equal(milkNode.GetProperty(key).GetRawText(), milkDotnet.GetProperty(key).GetRawText());
        }

        Assert.Equal(JsonValueKind.Null, milkDotnet.GetProperty("selling_price").ValueKind);
        Assert.True(milkDotnet.TryGetProperty("id", out _));
        Assert.Equal(StoreId, milkDotnet.GetProperty("store_id").GetString());
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Inventory_visibility_price_update_and_incoming_match_Node_including_db_state()
    {
        await using var scope = await Scope.OpenAsync();
        var manager = await scope.ManagerTokenAsync();
        await scope.ResetInventoryAsync(quantity: 5m, sellingPrice: 90m, visible: true);
        var path = $"/api/my-store/inventory/{ProductId}";

        // Quantity+status CASE is broken in Node SQL against inventory_status; visibility/price still parity.
        var node = await scope.PutAsync(scope.Node.Client, path, new { selling_price = 120m, is_visible = false }, manager);
        var dotnet = await scope.PutAsync(scope.Dotnet, path, new { selling_price = 120m, is_visible = false }, manager);
        Assert.Equal(HttpStatusCode.OK, node.StatusCode);
        Assert.Equal(node.StatusCode, dotnet.StatusCode);
        using (var n = JsonDocument.Parse(await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)))
        using (var d = JsonDocument.Parse(await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)))
        {
            Assert.Equal(["inventory"], n.RootElement.EnumerateObject().Select(x => x.Name));
            Assert.Equal(["inventory"], d.RootElement.EnumerateObject().Select(x => x.Name));
            Assert.Equal("120.00", d.RootElement.GetProperty("inventory").GetProperty("selling_price").GetString());
            Assert.False(d.RootElement.GetProperty("inventory").GetProperty("is_visible").GetBoolean());
            Assert.Equal(n.RootElement.GetProperty("inventory").GetProperty("selling_price").GetRawText(), d.RootElement.GetProperty("inventory").GetProperty("selling_price").GetRawText());
            Assert.Equal(n.RootElement.GetProperty("inventory").GetProperty("is_visible").GetRawText(), d.RootElement.GetProperty("inventory").GetProperty("is_visible").GetRawText());
        }

        await scope.AssertInventoryAsync(5m, 120m, false, "available");

        node = await scope.PostAsync(scope.Node.Client, path + "/incoming", new { quantity = 3 }, manager);
        await scope.ResetInventoryAsync(quantity: 5m, sellingPrice: 120m, visible: false);
        dotnet = await scope.PostAsync(scope.Dotnet, path + "/incoming", new { quantity = 3 }, manager);
        Assert.Equal(HttpStatusCode.OK, node.StatusCode);
        Assert.Equal(node.StatusCode, dotnet.StatusCode);
        using (var d = JsonDocument.Parse(await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)))
        {
            Assert.Equal("8.000", d.RootElement.GetProperty("inventory").GetProperty("quantity").GetString());
            Assert.Equal("available", d.RootElement.GetProperty("inventory").GetProperty("status").GetString());
            Assert.Equal(JsonValueKind.String, d.RootElement.GetProperty("inventory").GetProperty("last_delivery_date").ValueKind);
        }

        await scope.AssertInventoryAsync(8m, 120m, false, "available");
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Inventory_quantity_update_is_atomic_on_dotnet_with_status_cast()
    {
        await using var scope = await Scope.OpenAsync();
        var manager = await scope.ManagerTokenAsync();
        await scope.ResetInventoryAsync(quantity: 5m, sellingPrice: 90m, visible: true);
        var path = $"/api/my-store/inventory/{ProductId}";
        var response = await scope.PutAsync(scope.Dotnet, path, new { quantity = 1.5m, selling_price = 120m, is_visible = false }, manager);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal("1.500", json.RootElement.GetProperty("inventory").GetProperty("quantity").GetString());
        Assert.Equal("low_stock", json.RootElement.GetProperty("inventory").GetProperty("status").GetString());
        await scope.AssertInventoryAsync(1.5m, 120m, false, "low_stock");
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Analytics_aggregates_filtering_and_defaults_match_Node()
    {
        await using var scope = await Scope.OpenAsync();
        var manager = await scope.ManagerTokenAsync();
        await scope.InsertAnalyticsFixtureAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var node = await scope.GetAsync(scope.Node.Client, "/api/my-store/analytics", manager);
        var dotnet = await scope.GetAsync(scope.Dotnet, "/api/my-store/analytics", manager);
        Assert.Equal(HttpStatusCode.OK, node.StatusCode);
        Assert.Equal(node.StatusCode, dotnet.StatusCode);
        using (var n = JsonDocument.Parse(await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)))
        using (var d = JsonDocument.Parse(await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)))
        {
            Assert.Equal(["analytics"], n.RootElement.EnumerateObject().Select(x => x.Name));
            Assert.Equal(["analytics"], d.RootElement.EnumerateObject().Select(x => x.Name));
            Assert.Equal(n.RootElement.GetProperty("analytics").EnumerateObject().Select(x => x.Name).Order(), d.RootElement.GetProperty("analytics").EnumerateObject().Select(x => x.Name).Order());
            Assert.Equal(n.RootElement.GetProperty("analytics").GetProperty("funnel").GetRawText(), d.RootElement.GetProperty("analytics").GetProperty("funnel").GetRawText());
            AssertMoney(n.RootElement.GetProperty("analytics").GetProperty("gmv_delivered"), d.RootElement.GetProperty("analytics").GetProperty("gmv_delivered"));
            AssertMoney(n.RootElement.GetProperty("analytics").GetProperty("pos_collected"), d.RootElement.GetProperty("analytics").GetProperty("pos_collected"));
            AssertMoney(n.RootElement.GetProperty("analytics").GetProperty("avg_order_value"), d.RootElement.GetProperty("analytics").GetProperty("avg_order_value"));
            Assert.Equal(n.RootElement.GetProperty("analytics").GetProperty("stopped_items").GetInt32(), d.RootElement.GetProperty("analytics").GetProperty("stopped_items").GetInt32());
            Assert.Equal(n.RootElement.GetProperty("analytics").GetProperty("out_of_stock").GetInt32(), d.RootElement.GetProperty("analytics").GetProperty("out_of_stock").GetInt32());
            Assert.Equal(n.RootElement.GetProperty("analytics").GetProperty("low_stock").GetInt32(), d.RootElement.GetProperty("analytics").GetProperty("low_stock").GetInt32());
        }

        node = await scope.GetAsync(scope.Node.Client, $"/api/my-store/analytics?date_from={today}&date_to={today}", manager);
        dotnet = await scope.GetAsync(scope.Dotnet, $"/api/my-store/analytics?date_from={today}&date_to={today}", manager);
        Assert.Equal(HttpStatusCode.OK, node.StatusCode);
        Assert.Equal(node.StatusCode, dotnet.StatusCode);
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Inventory_rbac_store_isolation_and_validation_match_Node()
    {
        await using var scope = await Scope.OpenAsync();
        var manager = await scope.ManagerTokenAsync();
        var path = $"/api/my-store/inventory/{ProductId}";

        foreach (var email in new[] { "catalog@koz.kz", "admin@koz.kz", "customers@koz.kz" })
        {
            var token = await scope.StaffTokenAsync(email);
            await SameErrorAsync(await scope.GetAsync(scope.Node.Client, "/api/my-store/inventory", token), await scope.GetAsync(scope.Dotnet, "/api/my-store/inventory", token), HttpStatusCode.Forbidden);
        }

        await SameErrorAsync(await scope.GetAsync(scope.Node.Client, "/api/my-store/inventory", null), await scope.GetAsync(scope.Dotnet, "/api/my-store/inventory", null), HttpStatusCode.Unauthorized);

        var foreign = CreateToken(Guid.NewGuid(), "store_operator", Guid.NewGuid());
        var missingStore = CreateToken(Guid.NewGuid(), "store_operator", null);
        await SameErrorAsync(await scope.PutAsync(scope.Node.Client, path, new { is_visible = true }, foreign), await scope.PutAsync(scope.Dotnet, path, new { is_visible = true }, foreign), HttpStatusCode.NotFound);
        await SameErrorAsync(await scope.PutAsync(scope.Node.Client, path, new { is_visible = true }, missingStore), await scope.PutAsync(scope.Dotnet, path, new { is_visible = true }, missingStore), HttpStatusCode.Forbidden);
        await SameErrorAsync(await scope.PutAsync(scope.Node.Client, path, new { }, manager), await scope.PutAsync(scope.Dotnet, path, new { }, manager), HttpStatusCode.BadRequest);
        await SameErrorAsync(await scope.PostAsync(scope.Node.Client, path + "/incoming", new { quantity = 0 }, manager), await scope.PostAsync(scope.Dotnet, path + "/incoming", new { quantity = 0 }, manager), HttpStatusCode.BadRequest);
        await SameErrorAsync(
            await scope.PutAsync(scope.Node.Client, $"/api/my-store/inventory/{Guid.NewGuid()}", new { is_visible = true }, manager),
            await scope.PutAsync(scope.Dotnet, $"/api/my-store/inventory/{Guid.NewGuid()}", new { is_visible = true }, manager),
            HttpStatusCode.NotFound);
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Inventory_concurrent_visibility_updates_match_Node_for_five_resets()
    {
        for (var run = 0; run < 5; run++)
        {
            await using var scope = await Scope.OpenAsync();
            var manager = await scope.ManagerTokenAsync();
            await scope.ResetInventoryAsync(quantity: 10m, sellingPrice: 50m, visible: true);
            var path = $"/api/my-store/inventory/{ProductId}";
            var node = await ConcurrentAsync(
                () => scope.PutAsync(scope.Node.Client, path, new { is_visible = false }, manager),
                () => scope.PutAsync(scope.Node.Client, path, new { is_visible = true }, manager));
            await scope.ResetInventoryAsync(quantity: 10m, sellingPrice: 50m, visible: true);
            var dotnet = await ConcurrentAsync(
                () => scope.PutAsync(scope.Dotnet, path, new { is_visible = false }, manager),
                () => scope.PutAsync(scope.Dotnet, path, new { is_visible = true }, manager));
            Assert.Equal(node.Select(x => x.StatusCode).Order(), dotnet.Select(x => x.StatusCode).Order());
            Assert.All(node, x => Assert.Equal(HttpStatusCode.OK, x.StatusCode));
            Assert.All(dotnet, x => Assert.Equal(HttpStatusCode.OK, x.StatusCode));
        }
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Inventory_concurrent_quantity_updates_are_single_winner_on_dotnet_for_five_resets()
    {
        for (var run = 0; run < 5; run++)
        {
            await using var scope = await Scope.OpenAsync();
            var manager = await scope.ManagerTokenAsync();
            await scope.ResetInventoryAsync(quantity: 10m, sellingPrice: 50m, visible: true);
            var path = $"/api/my-store/inventory/{ProductId}";
            var responses = await ConcurrentAsync(
                () => scope.PutAsync(scope.Dotnet, path, new { quantity = 2m, is_visible = false }, manager),
                () => scope.PutAsync(scope.Dotnet, path, new { quantity = 8m, is_visible = true }, manager));
            Assert.All(responses, x => Assert.Equal(HttpStatusCode.OK, x.StatusCode));
            Assert.Contains(await scope.QuantityAsync(), new[] { 2m, 8m });
        }
    }

    private static void AssertMoney(JsonElement node, JsonElement dotnet)
    {
        var left = decimal.Parse(node.GetString()!, CultureInfo.InvariantCulture);
        var right = decimal.Parse(dotnet.GetString()!, CultureInfo.InvariantCulture);
        Assert.Equal(left, right);
    }

    private static async Task SameErrorAsync(HttpResponseMessage node, HttpResponseMessage dotnet, HttpStatusCode status)
    {
        Assert.Equal(status, node.StatusCode);
        Assert.Equal(node.StatusCode, dotnet.StatusCode);
        using var n = JsonDocument.Parse(await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        using var d = JsonDocument.Parse(await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal(n.RootElement.GetProperty("code").GetString(), d.RootElement.GetProperty("code").GetString());
        Assert.Equal(n.RootElement.GetProperty("message").GetString(), d.RootElement.GetProperty("message").GetString());
    }

    private static async Task<HttpResponseMessage[]> ConcurrentAsync(Func<Task<HttpResponseMessage>> left, Func<Task<HttpResponseMessage>> right)
    {
        using var barrier = new Barrier(2);
        var tasks = new[]
        {
            Task.Run(async () => { barrier.SignalAndWait(); return await left(); }),
            Task.Run(async () => { barrier.SignalAndWait(); return await right(); }),
        };
        return await Task.WhenAll(tasks);
    }

    private static string CreateToken(Guid id, string role, Guid? store)
    {
        var header = Base64Url(Encoding.UTF8.GetBytes("""{"alg":"HS256","typ":"JWT"}"""));
        var payload = Base64Url(JsonSerializer.SerializeToUtf8Bytes(new
        {
            id = id.ToString(),
            role,
            store_id = store?.ToString(),
            iat = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            exp = DateTimeOffset.UtcNow.AddMinutes(15).ToUnixTimeSeconds(),
        }));
        var input = header + "." + payload;
        return input + "." + Base64Url(HMACSHA256.HashData(Encoding.UTF8.GetBytes("net1-testing-jwt-secret-with-at-least-32-characters"), Encoding.UTF8.GetBytes(input)));
    }

    private static string Base64Url(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private sealed class Scope : IAsyncDisposable
    {
        private readonly Net1ApiFactory factory;
        private readonly NpgsqlDataSource data;

        private Scope(Net1ApiFactory factory, HttpClient dotnet, NodeAuthServer node, NpgsqlDataSource data)
        {
            this.factory = factory;
            Dotnet = dotnet;
            Node = node;
            this.data = data;
        }

        public HttpClient Dotnet { get; }
        public NodeAuthServer Node { get; }

        public static async Task<Scope> OpenAsync()
        {
            var value = Environment.GetEnvironmentVariable("KOZ_NET4A_TEST_CONNECTION_STRING");
            if (string.IsNullOrWhiteSpace(value))
                throw SkipException.ForSkip("Set KOZ_NET4A_TEST_CONNECTION_STRING.");
            Assert.Equal("koz_dotnet_net4a_test", new NpgsqlConnectionStringBuilder(value).Database);
            await ResetAsync(value);
            var factory = new Net1ApiFactory(value);
            return new(factory, factory.CreateClient(), await NodeAuthServer.StartAsync(value, TestContext.Current.CancellationToken), NpgsqlDataSource.Create(value));
        }

        public async Task<string> ManagerTokenAsync()
        {
            var response = await Dotnet.PostAsJsonAsync("/api/auth/staff/login", new { email = "manager@koz.kz", password = "Manager123" }, TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
            return json.RootElement.GetProperty("token").GetString()!;
        }

        public async Task<string> StaffTokenAsync(string email)
        {
            var response = await Dotnet.PostAsJsonAsync("/api/auth/staff/login", new { email, password = "Manager123" }, TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
            return json.RootElement.GetProperty("token").GetString()!;
        }

        public Task<HttpResponseMessage> GetAsync(HttpClient client, string path, string? token)
        {
            var request = new HttpRequestMessage(HttpMethod.Get, path);
            if (token is not null)
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return client.SendAsync(request, TestContext.Current.CancellationToken);
        }

        public Task<HttpResponseMessage> PutAsync(HttpClient client, string path, object body, string? token)
        {
            var request = new HttpRequestMessage(HttpMethod.Put, path) { Content = JsonContent.Create(body) };
            if (token is not null)
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return client.SendAsync(request, TestContext.Current.CancellationToken);
        }

        public Task<HttpResponseMessage> PostAsync(HttpClient client, string path, object body, string? token)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
            if (token is not null)
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return client.SendAsync(request, TestContext.Current.CancellationToken);
        }

        public async Task ResetInventoryAsync(decimal quantity, decimal? sellingPrice, bool visible)
        {
            await using var command = data.CreateCommand(
                """
                UPDATE store_inventory
                SET quantity=$3::numeric,
                    stock_quantity=CEIL($3::numeric)::int,
                    selling_price=$4,
                    is_visible=$5,
                    status=(CASE WHEN $3::numeric<=0 THEN 'out_of_stock' WHEN $3::numeric<=2 THEN 'low_stock' ELSE 'available' END)::inventory_status,
                    updated_at=NOW()
                WHERE store_id=$1 AND product_id=$2
                """);
            command.Parameters.AddWithValue(Guid.Parse(StoreId));
            command.Parameters.AddWithValue(Guid.Parse(ProductId));
            command.Parameters.AddWithValue(quantity);
            command.Parameters.AddWithValue(sellingPrice is null ? DBNull.Value : sellingPrice.Value);
            command.Parameters.AddWithValue(visible);
            await command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        }

        public async Task AssertInventoryAsync(decimal quantity, decimal? sellingPrice, bool visible, string status)
        {
            await using var command = data.CreateCommand("SELECT quantity,selling_price,is_visible,status::text FROM store_inventory WHERE store_id=$1 AND product_id=$2");
            command.Parameters.AddWithValue(Guid.Parse(StoreId));
            command.Parameters.AddWithValue(Guid.Parse(ProductId));
            await using var reader = await command.ExecuteReaderAsync(TestContext.Current.CancellationToken);
            Assert.True(await reader.ReadAsync(TestContext.Current.CancellationToken));
            Assert.Equal(quantity, reader.GetDecimal(0));
            if (sellingPrice is null) Assert.True(reader.IsDBNull(1)); else Assert.Equal(sellingPrice.Value, reader.GetDecimal(1));
            Assert.Equal(visible, reader.GetBoolean(2));
            Assert.Equal(status, reader.GetString(3));
        }

        public async Task<decimal> QuantityAsync()
        {
            await using var command = data.CreateCommand("SELECT quantity FROM store_inventory WHERE store_id=$1 AND product_id=$2");
            command.Parameters.AddWithValue(Guid.Parse(StoreId));
            command.Parameters.AddWithValue(Guid.Parse(ProductId));
            return (decimal)(await command.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
        }

        public async Task InsertAnalyticsFixtureAsync()
        {
            await ResetAsync(data.ConnectionString);
            await ResetInventoryAsync(0m, null, false);
            await using var low = data.CreateCommand("UPDATE store_inventory SET quantity=1,stock_quantity=1,status='low_stock'::inventory_status,is_visible=true WHERE store_id=$1 AND product_id<>$2");
            low.Parameters.AddWithValue(Guid.Parse(StoreId));
            low.Parameters.AddWithValue(Guid.Parse(ProductId));
            await low.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);

            var customer = Guid.NewGuid();
            var order = Guid.NewGuid();
            await ExecuteAsync("INSERT INTO customers(id,store_id,phone,subscription_status) VALUES($1,$2,$3,'active')", customer, Guid.Parse(StoreId), "n4a" + Guid.NewGuid().ToString("N")[..20]);
            await ExecuteAsync(
                "INSERT INTO orders(id,order_number,store_id,customer_id,subtotal,discount_total,delivery_fee,estimated_weight,online_payment_amount,online_capture_amount,pos_terminal_topup,final_total,total_price,fulfillment_window,delivery_status,payment_status,created_at) VALUES($1,$2,$3,$4,1000,0,500,1,1000,1000,200,1200,1200,'same_day','delivered','fully_paid',NOW())",
                order, "N4A-" + Guid.NewGuid().ToString("N")[..12], Guid.Parse(StoreId), customer);
        }

        private async Task ExecuteAsync(string sql, params object[] values)
        {
            await using var command = data.CreateCommand(sql);
            foreach (var value in values)
                command.Parameters.AddWithValue(value);
            await command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        }

        private static async Task ResetAsync(string connection)
        {
            await using var data = NpgsqlDataSource.Create(connection);
            foreach (var sql in new[] { "DELETE FROM payments", "DELETE FROM order_status_history", "DELETE FROM order_items", "DELETE FROM orders", "DELETE FROM customers" })
            {
                await using var command = data.CreateCommand(sql);
                await command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
            }
        }

        public async ValueTask DisposeAsync()
        {
            data.Dispose();
            Node.Dispose();
            Dotnet.Dispose();
            factory.Dispose();
            await Task.CompletedTask;
        }
    }
}
