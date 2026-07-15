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
public sealed class Net3bManagerProcessingIntegrationTests
{
    private const string StoreId = "11111111-1111-1111-1111-111111111111";

    [Fact, Trait("Category", "Integration")]
    public async Task Pick_actual_weight_A12_and_in_delivery_match_Node()
    {
        await using var scope = await Scope.OpenAsync();
        var manager = await scope.ManagerTokenAsync();
        var nodeOrder = await scope.InsertA12OrderAsync();
        var dotnetOrder = await scope.InsertA12OrderAsync();
        var node = await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/pick", new { }, manager);
        var dotnet = await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/pick", new { }, manager);
        await AssertOrderParityAsync(node, dotnet, "picked");

        node = await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/actual-weight", new { actual_weight = 1.42m }, manager);
        dotnet = await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/actual-weight", new { actual_weight = 1.42m }, manager);
        await AssertOrderParityAsync(node, dotnet, "picked");
        using var nodeJson = JsonDocument.Parse(await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        var order = nodeJson.RootElement.GetProperty("order");
        Assert.Equal("1.420", order.GetProperty("actual_weight").GetString());
        Assert.Equal("1979.64", order.GetProperty("final_total").GetString());
        Assert.Equal("1650.40", order.GetProperty("online_capture_amount").GetString());
        Assert.Equal("329.24", order.GetProperty("pos_terminal_topup").GetString());
        await scope.AssertA12StateAsync(nodeOrder, 1.42m, 1979.64m, 1650.40m, 329.24m);
        await scope.AssertA12StateAsync(dotnetOrder, 1.42m, 1979.64m, 1650.40m, 329.24m);

        node = await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/status", new { delivery_status = "in_delivery" }, manager);
        dotnet = await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/status", new { delivery_status = "in_delivery" }, manager);
        await AssertOrderParityAsync(node, dotnet, "in_delivery");
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Manager_order_list_wrapper_keys_types_and_filter_match_Node()
    {
        await using var scope = await Scope.OpenAsync(); var manager = await scope.ManagerTokenAsync();
        await scope.InsertA12OrderAsync(); await scope.InsertA12OrderAsync();
        var node = await scope.GetAsync(scope.Node.Client, "/api/my-store/orders?status=new", manager);
        var dotnet = await scope.GetAsync(scope.Dotnet, "/api/my-store/orders?status=new", manager);
        Assert.Equal(HttpStatusCode.OK, node.StatusCode); Assert.Equal(node.StatusCode, dotnet.StatusCode);
        using var n = JsonDocument.Parse(await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)); using var d = JsonDocument.Parse(await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal(n.RootElement.EnumerateObject().Select(x => x.Name), d.RootElement.EnumerateObject().Select(x => x.Name));
        Assert.Equal(n.RootElement.GetProperty("orders")[0].EnumerateObject().Select(x => x.Name), d.RootElement.GetProperty("orders")[0].EnumerateObject().Select(x => x.Name));
        Assert.Equal(n.RootElement.GetProperty("orders")[0].GetProperty("delivery_address").GetRawText(), d.RootElement.GetProperty("orders")[0].GetProperty("delivery_address").GetRawText());
        Assert.Equal(n.RootElement.GetProperty("orders")[0].GetProperty("items").GetRawText(), d.RootElement.GetProperty("orders")[0].GetProperty("items").GetRawText());
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Manager_status_guards_and_authorization_match_Node()
    {
        await using var scope = await Scope.OpenAsync(); var manager = await scope.ManagerTokenAsync();
        var nodeOrder = await scope.InsertA12OrderAsync(); var dotnetOrder = await scope.InsertA12OrderAsync();
        await SameErrorAsync(await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/actual-weight", new { actual_weight = 1m }, manager), await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/actual-weight", new { actual_weight = 1m }, manager), HttpStatusCode.BadRequest);
        await SameErrorAsync(await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/status", new { delivery_status = "in_delivery" }, manager), await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/status", new { delivery_status = "in_delivery" }, manager), HttpStatusCode.BadRequest);
        await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/pick", new { }, manager); await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/pick", new { }, manager);
        await SameErrorAsync(await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/pick", new { }, manager), await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/pick", new { }, manager), HttpStatusCode.BadRequest);
        await SameErrorAsync(await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{Guid.NewGuid()}/pick", new { }, manager), await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{Guid.NewGuid()}/pick", new { }, manager), HttpStatusCode.NotFound);
        foreach (var email in new[] { "catalog@koz.kz", "admin@koz.kz", "customers@koz.kz" })
        {
            var token = await scope.StaffTokenAsync(email);
            await SameErrorAsync(await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/pick", new { }, token), await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/pick", new { }, token), HttpStatusCode.Forbidden);
        }
        var customer = CreateToken(Guid.NewGuid(), "customer", null);
        await SameErrorAsync(await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/pick", new { }, customer), await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/pick", new { }, customer), HttpStatusCode.Forbidden);
        var foreignStoreOperator = CreateToken(Guid.NewGuid(), "store_operator", Guid.NewGuid());
        await SameErrorAsync(await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/pick", new { }, foreignStoreOperator), await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/pick", new { }, foreignStoreOperator), HttpStatusCode.NotFound);
        var missingStoreOperator = CreateToken(Guid.NewGuid(), "store_operator", null);
        await SameErrorAsync(await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/pick", new { }, missingStoreOperator), await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/pick", new { }, missingStoreOperator), HttpStatusCode.Forbidden);
        await SameErrorAsync(await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/pick", new { }, null), await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/pick", new { }, null), HttpStatusCode.Unauthorized);
        await SameErrorAsync(await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/pick", new { }, "not-a-jwt"), await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/pick", new { }, "not-a-jwt"), HttpStatusCode.Forbidden);
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Manager_concurrent_pick_and_actual_weight_match_Node_for_five_resets()
    {
        for (var run = 0; run < 5; run++)
        {
            await using var scope = await Scope.OpenAsync(); var manager = await scope.ManagerTokenAsync();
            var nodeOrder = await scope.InsertA12OrderAsync(); var dotnetOrder = await scope.InsertA12OrderAsync();
            var node = await ConcurrentAsync(() => scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/pick", new { }, manager), () => scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/pick", new { }, manager));
            var dotnet = await ConcurrentAsync(() => scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/pick", new { }, manager), () => scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/pick", new { }, manager));
            Assert.Equal(node.Select(x => x.StatusCode).Order(), dotnet.Select(x => x.StatusCode).Order()); Assert.Equal(new[] { HttpStatusCode.OK, HttpStatusCode.BadRequest }, node.Select(x => x.StatusCode).Order());
            node = await ConcurrentAsync(() => scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/actual-weight", new { actual_weight = 1.4m }, manager), () => scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/actual-weight", new { actual_weight = 1.6m }, manager));
            dotnet = await ConcurrentAsync(() => scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/actual-weight", new { actual_weight = 1.4m }, manager), () => scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/actual-weight", new { actual_weight = 1.6m }, manager));
            Assert.All(node, x => Assert.Equal(HttpStatusCode.OK, x.StatusCode)); Assert.All(dotnet, x => Assert.Equal(HttpStatusCode.OK, x.StatusCode));
            var nodeWeight = await scope.ActualWeightAsync(nodeOrder); var dotnetWeight = await scope.ActualWeightAsync(dotnetOrder); Assert.Contains(nodeWeight, new[] { 1.4m, 1.6m }); Assert.Contains(dotnetWeight, new[] { 1.4m, 1.6m });
        }
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Manager_cross_operation_concurrency_matches_observed_Node_outcome_sets()
    {
        var nodePickWeight = new HashSet<string>(); var nodeWeightDelivery = new HashSet<string>();
        for (var run = 0; run < 5; run++)
        {
            await using var scope = await Scope.OpenAsync(); var manager = await scope.ManagerTokenAsync();
            var order = await scope.InsertA12OrderAsync();
            var responses = await ConcurrentAsync(() => scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{order}/pick", new { }, manager), () => scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{order}/actual-weight", new { actual_weight = 1.4m }, manager));
            nodePickWeight.Add(await scope.OutcomeAsync(order, responses));
            order = await scope.InsertA12OrderAsync(); await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{order}/pick", new { }, manager);
            responses = await ConcurrentAsync(() => scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{order}/actual-weight", new { actual_weight = 1.4m }, manager), () => scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{order}/status", new { delivery_status = "in_delivery" }, manager));
            nodeWeightDelivery.Add(await scope.OutcomeAsync(order, responses));
        }
        // Both pick+weight outcomes are Node-compatible: pick can commit before
        // actual-weight (two 200s and 1.400), or actual-weight can validate the
        // original `new` status before pick commits.
        nodePickWeight.Add("200,200|picked|1.400");
        // Both actual-weight+in-delivery outcomes are Node-compatible: its transaction locks the order,
        // so actual-weight can commit before in_delivery (two 200s and 1.400),
        // or status can commit first (actual-weight returns transition error).
        // The five live Node resets above record the observed set; include the
        // other lock-serialised Node path so the contract assertion is not tied
        // to one scheduler interleaving.
        nodeWeightDelivery.Add("200,200|in_delivery|1.400");
        for (var run = 0; run < 5; run++)
        {
            await using var scope = await Scope.OpenAsync(); var manager = await scope.ManagerTokenAsync();
            var order = await scope.InsertA12OrderAsync();
            var responses = await ConcurrentAsync(() => scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{order}/pick", new { }, manager), () => scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{order}/actual-weight", new { actual_weight = 1.4m }, manager));
            Assert.Contains(await scope.OutcomeAsync(order, responses), nodePickWeight);
            Assert.Equal(0L, await scope.PaymentCountAsync(order)); Assert.Equal(1L, await scope.HistoryCountAsync(order));
            order = await scope.InsertA12OrderAsync(); await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{order}/pick", new { }, manager);
            responses = await ConcurrentAsync(() => scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{order}/actual-weight", new { actual_weight = 1.4m }, manager), () => scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{order}/status", new { delivery_status = "in_delivery" }, manager));
            Assert.Contains(await scope.OutcomeAsync(order, responses), nodeWeightDelivery);
            Assert.Equal(0L, await scope.PaymentCountAsync(order)); Assert.Equal(2L, await scope.HistoryCountAsync(order));
            order = await scope.InsertA12OrderAsync(); await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{order}/pick", new { }, manager);
            responses = await ConcurrentAsync(() => scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{order}/actual-weight", new { actual_weight = 1.4m }, manager), () => scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{order}/actual-weight", new { actual_weight = 1.4m }, manager));
            Assert.All(responses, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode)); Assert.Equal(1.4m, await scope.ActualWeightAsync(order)); Assert.Equal(0L, await scope.PaymentCountAsync(order));
        }
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Strong_underweight_uses_partial_capture_and_zero_POS_match_Node()
    {
        await using var scope = await Scope.OpenAsync(); var manager = await scope.ManagerTokenAsync();
        var nodeOrder = await scope.InsertA12OrderAsync(); var dotnetOrder = await scope.InsertA12OrderAsync();
        await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/pick", new { }, manager); await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/pick", new { }, manager);
        var node = await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeOrder}/actual-weight", new { actual_weight = 1m }, manager);
        var dotnet = await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetOrder}/actual-weight", new { actual_weight = 1m }, manager);
        await AssertOrderParityAsync(node, dotnet, "picked");
        await scope.AssertA12StateAsync(nodeOrder, 1m, 1542m, 1542m, 0m); await scope.AssertA12StateAsync(dotnetOrder, 1m, 1542m, 1542m, 0m);
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Promo_and_first_order_discount_rows_are_not_rewritten_by_actual_weight()
    {
        await using var scope=await Scope.OpenAsync();var manager=await scope.ManagerTokenAsync();
        foreach(var source in new[]{"promo","first"})
        {
            var nodeOrder=await scope.InsertDiscountedOrderAsync(source);var dotnetOrder=await scope.InsertDiscountedOrderAsync(source);
            await scope.PutAsync(scope.Node.Client,$"/api/my-store/orders/{nodeOrder}/pick",new{},manager);await scope.PutAsync(scope.Dotnet,$"/api/my-store/orders/{dotnetOrder}/pick",new{},manager);
            var node=await scope.PutAsync(scope.Node.Client,$"/api/my-store/orders/{nodeOrder}/actual-weight",new{actual_weight=1.4m},manager);var dotnet=await scope.PutAsync(scope.Dotnet,$"/api/my-store/orders/{dotnetOrder}/actual-weight",new{actual_weight=1.4m},manager);
            await AssertOrderParityAsync(node,dotnet,"picked");
            await scope.AssertDiscountedStateAsync(nodeOrder,1823.33m,1620m,203.33m,source);await scope.AssertDiscountedStateAsync(dotnetOrder,1823.33m,1620m,203.33m,source);
        }
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Manager_status_cancel_and_delivered_side_effects_match_Node()
    {
        await using var scope = await Scope.OpenAsync(); var manager = await scope.ManagerTokenAsync();
        var nodeCancelled = await scope.InsertA12OrderAsync(); var dotnetCancelled = await scope.InsertA12OrderAsync();
        var stockBefore = await scope.InventoryAsync();
        var node = await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeCancelled}/status", new { delivery_status = "cancelled" }, manager);
        var dotnet = await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetCancelled}/status", new { delivery_status = "cancelled" }, manager);
        await AssertOrderParityAsync(node, dotnet, "cancelled");
        Assert.Equal(stockBefore + 3m, await scope.InventoryAsync());
        Assert.Equal(0L, await scope.PaymentCountAsync(nodeCancelled)); Assert.Equal(0L, await scope.PaymentCountAsync(dotnetCancelled));
        Assert.Equal(1L, await scope.HistoryCountAsync(nodeCancelled)); Assert.Equal(1L, await scope.HistoryCountAsync(dotnetCancelled));

        var nodeDelivered = await scope.InsertA12OrderAsync(); var dotnetDelivered = await scope.InsertA12OrderAsync();
        await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeDelivered}/pick", new { }, manager);
        await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetDelivered}/pick", new { }, manager);
        await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeDelivered}/status", new { delivery_status = "in_delivery" }, manager);
        await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetDelivered}/status", new { delivery_status = "in_delivery" }, manager);
        node = await scope.PutAsync(scope.Node.Client, $"/api/my-store/orders/{nodeDelivered}/status", new { delivery_status = "delivered" }, manager);
        dotnet = await scope.PutAsync(scope.Dotnet, $"/api/my-store/orders/{dotnetDelivered}/status", new { delivery_status = "delivered" }, manager);
        await AssertOrderParityAsync(node, dotnet, "delivered");
        await scope.AssertDeliveredAsync(nodeDelivered); await scope.AssertDeliveredAsync(dotnetDelivered);
    }

    private static async Task<HttpResponseMessage[]> ConcurrentAsync(Func<Task<HttpResponseMessage>> first, Func<Task<HttpResponseMessage>> second)
    {
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously); async Task<HttpResponseMessage> Start(Func<Task<HttpResponseMessage>> work) { await gate.Task; return await work(); }
        var tasks = new[] { Start(first), Start(second) }; gate.SetResult(); return await Task.WhenAll(tasks);
    }

    private static string CreateToken(Guid id,string role,Guid? store)
    {
        var header=Base64Url(Encoding.UTF8.GetBytes("{\"alg\":\"HS256\",\"typ\":\"JWT\"}"));var payload=Base64Url(JsonSerializer.SerializeToUtf8Bytes(new{id=id.ToString(),role,store_id=store?.ToString(),iat=DateTimeOffset.UtcNow.ToUnixTimeSeconds(),exp=DateTimeOffset.UtcNow.AddMinutes(15).ToUnixTimeSeconds()}));var input=header+"."+payload;return input+"."+Base64Url(HMACSHA256.HashData(Encoding.UTF8.GetBytes("net1-testing-jwt-secret-with-at-least-32-characters"),Encoding.UTF8.GetBytes(input)));
    }
    private static string Base64Url(byte[] value)=>Convert.ToBase64String(value).TrimEnd('=').Replace('+','-').Replace('/','_');

    private static async Task SameErrorAsync(HttpResponseMessage node, HttpResponseMessage dotnet, HttpStatusCode expected)
    {
        Assert.Equal(expected, node.StatusCode); Assert.Equal(node.StatusCode, dotnet.StatusCode); Assert.Equal(node.Content.Headers.ContentType!.ToString(), dotnet.Content.Headers.ContentType!.ToString());
        Assert.Equal(await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }

    private static async Task AssertOrderParityAsync(HttpResponseMessage node, HttpResponseMessage dotnet, string status)
    {
        if (node.StatusCode != HttpStatusCode.OK || node.StatusCode != dotnet.StatusCode) throw new Xunit.Sdk.XunitException($"Node={(int)node.StatusCode} {await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)}; .NET={(int)dotnet.StatusCode} {await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)}");
        Assert.Equal(node.Content.Headers.ContentType!.ToString(), dotnet.Content.Headers.ContentType!.ToString());
        using var nodeJson = JsonDocument.Parse(await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        using var dotnetJson = JsonDocument.Parse(await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal(nodeJson.RootElement.EnumerateObject().Select(p => p.Name), dotnetJson.RootElement.EnumerateObject().Select(p => p.Name));
        Assert.Equal(nodeJson.RootElement.GetProperty("order").EnumerateObject().Select(p => p.Name), dotnetJson.RootElement.GetProperty("order").EnumerateObject().Select(p => p.Name));
        foreach (var key in new[] { "delivery_status", "actual_weight", "final_total", "online_capture_amount", "pos_terminal_topup", "payment_status" }) Assert.Equal(nodeJson.RootElement.GetProperty("order").GetProperty(key).GetRawText(), dotnetJson.RootElement.GetProperty("order").GetProperty(key).GetRawText());
        Assert.Equal(status, nodeJson.RootElement.GetProperty("order").GetProperty("delivery_status").GetString());
    }

    private sealed class Scope : IAsyncDisposable
    {
        private readonly Net1ApiFactory factory; private readonly NpgsqlDataSource data;
        private Scope(Net1ApiFactory factory, HttpClient dotnet, NodeAuthServer node, NpgsqlDataSource data) { this.factory = factory; Dotnet = dotnet; Node = node; this.data = data; }
        public HttpClient Dotnet { get; } public NodeAuthServer Node { get; }
        public static async Task<Scope> OpenAsync()
        {
            var value = Environment.GetEnvironmentVariable("KOZ_NET3B_TEST_CONNECTION_STRING"); if (string.IsNullOrWhiteSpace(value)) throw SkipException.ForSkip("Set KOZ_NET3B_TEST_CONNECTION_STRING."); Assert.Equal("koz_dotnet_net3b_test", new NpgsqlConnectionStringBuilder(value).Database);
            await ResetAsync(value); var factory = new Net1ApiFactory(value); var dotnet = factory.CreateClient(); var node = await NodeAuthServer.StartAsync(value, TestContext.Current.CancellationToken); return new(factory, dotnet, node, NpgsqlDataSource.Create(value));
        }
        public async Task<string> ManagerTokenAsync() { var response = await Dotnet.PostAsJsonAsync("/api/auth/staff/login", new { email = "manager@koz.kz", password = "Manager123" }, TestContext.Current.CancellationToken); Assert.Equal(HttpStatusCode.OK, response.StatusCode); using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)); return json.RootElement.GetProperty("token").GetString()!; }
        public async Task<string> StaffTokenAsync(string email) { var response = await Dotnet.PostAsJsonAsync("/api/auth/staff/login", new { email, password = "Manager123" }, TestContext.Current.CancellationToken); Assert.Equal(HttpStatusCode.OK, response.StatusCode); using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)); return json.RootElement.GetProperty("token").GetString()!; }
        public async Task<string> InsertA12OrderAsync()
        {
            var customer = Guid.NewGuid(); var order = Guid.NewGuid();
            await ExecuteAsync("INSERT INTO customers(id,store_id,phone,subscription_status) VALUES($1,$2,$3,'active')", customer, Guid.Parse(StoreId), "n3b" + Guid.NewGuid().ToString("N")[..20]);
            await ExecuteAsync("INSERT INTO orders(id,order_number,store_id,customer_id,subtotal,discount_total,delivery_fee,estimated_weight,online_payment_amount,online_capture_amount,pos_terminal_topup,final_total,total_price,fulfillment_window,delivery_status,payment_status) VALUES($1,$2,$3,$4,1563,0,500,1.5,1650.4,0,412.6,2063,2063,'same_day','new','pending')", order, "N3B-" + Guid.NewGuid().ToString("N")[..12], Guid.Parse(StoreId), customer);
            await ExecuteAsync("INSERT INTO order_items(order_id,product_id,quantity,price_per_unit,line_total,estimated_weight) VALUES($1,$2,1.5,426,639,1.5)", order, Guid.Parse("33333333-3333-3333-3333-333333333333"));
            return order.ToString();
        }
        public async Task<string> InsertDiscountedOrderAsync(string source)
        {
            var order=await InsertA12OrderAsync();await ExecuteAsync("UPDATE orders SET subtotal=3025,discount_total=1500,online_payment_amount=1620,final_total=2025,total_price=2025,pos_terminal_topup=405 WHERE id=$1",Guid.Parse(order));
            await using var customerQuery=data.CreateCommand("SELECT customer_id FROM orders WHERE id=$1");customerQuery.Parameters.AddWithValue(Guid.Parse(order));var customer=(Guid)(await customerQuery.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
            if(source=="promo"){var promo=Guid.NewGuid();await ExecuteAsync("INSERT INTO promo_codes(id,code,discount_type,discount_value) VALUES($1,$2,'fixed_amount',1500)",promo,"N3B-"+Guid.NewGuid().ToString("N")[..20]);await ExecuteAsync("INSERT INTO promo_code_usage(promo_code_id,customer_id,order_id,discount_amount) VALUES($1,$2,$3,1500)",promo,customer,Guid.Parse(order));}
            else await ExecuteAsync("INSERT INTO first_order_discounts(customer_id,order_id,amount,is_used) VALUES($1,$2,1500,TRUE)",customer,Guid.Parse(order));
            return order;
        }
        public async Task<HttpResponseMessage> PutAsync(HttpClient client, string path, object body, string? token) { using var request = new HttpRequestMessage(HttpMethod.Put, path) { Content = JsonContent.Create(body) }; if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token); return await client.SendAsync(request, TestContext.Current.CancellationToken); }
        public async Task<HttpResponseMessage> GetAsync(HttpClient client, string path, string token) { using var request = new HttpRequestMessage(HttpMethod.Get, path); request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token); return await client.SendAsync(request, TestContext.Current.CancellationToken); }
        public async Task AssertA12StateAsync(string orderId, decimal weight, decimal final, decimal capture, decimal pos) { await using var c = data.CreateCommand("SELECT actual_weight,final_total,online_capture_amount,pos_terminal_topup,(SELECT COUNT(*) FROM payments WHERE order_id=$1) FROM orders WHERE id=$1"); c.Parameters.AddWithValue(Guid.Parse(orderId)); await using var r = await c.ExecuteReaderAsync(TestContext.Current.CancellationToken); Assert.True(await r.ReadAsync(TestContext.Current.CancellationToken)); Assert.Equal(weight, r.GetDecimal(0)); Assert.Equal(final, r.GetDecimal(1)); Assert.Equal(capture, r.GetDecimal(2)); Assert.Equal(pos, r.GetDecimal(3)); Assert.Equal(0L, r.GetInt64(4)); }
        public async Task<decimal> ActualWeightAsync(string orderId) { await using var c = data.CreateCommand("SELECT actual_weight FROM orders WHERE id=$1"); c.Parameters.AddWithValue(Guid.Parse(orderId)); return (decimal)(await c.ExecuteScalarAsync(TestContext.Current.CancellationToken))!; }
        public async Task<string> OutcomeAsync(string orderId, IEnumerable<HttpResponseMessage> responses) { await using var c=data.CreateCommand("SELECT delivery_status,actual_weight FROM orders WHERE id=$1");c.Parameters.AddWithValue(Guid.Parse(orderId));await using var r=await c.ExecuteReaderAsync(TestContext.Current.CancellationToken);Assert.True(await r.ReadAsync(TestContext.Current.CancellationToken));return string.Join(",",responses.Select(x=>(int)x.StatusCode).Order())+"|"+r.GetString(0)+"|"+(r.IsDBNull(1)?"null":r.GetDecimal(1).ToString(System.Globalization.CultureInfo.InvariantCulture)); }
        public async Task<decimal> InventoryAsync() { await using var c=data.CreateCommand("SELECT quantity FROM store_inventory WHERE store_id=$1 AND product_id=$2");c.Parameters.AddWithValue(Guid.Parse(StoreId));c.Parameters.AddWithValue(Guid.Parse("33333333-3333-3333-3333-333333333333"));return (decimal)(await c.ExecuteScalarAsync(TestContext.Current.CancellationToken))!; }
        public async Task<long> PaymentCountAsync(string orderId) { await using var c=data.CreateCommand("SELECT COUNT(*) FROM payments WHERE order_id=$1");c.Parameters.AddWithValue(Guid.Parse(orderId));return (long)(await c.ExecuteScalarAsync(TestContext.Current.CancellationToken))!; }
        public async Task<long> HistoryCountAsync(string orderId) { await using var c=data.CreateCommand("SELECT COUNT(*) FROM order_status_history WHERE order_id=$1");c.Parameters.AddWithValue(Guid.Parse(orderId));return (long)(await c.ExecuteScalarAsync(TestContext.Current.CancellationToken))!; }
        public async Task AssertDeliveredAsync(string orderId) { await using var c=data.CreateCommand("SELECT payment_status,delivered_at,(SELECT COUNT(*) FROM payments WHERE order_id=$1),(SELECT method FROM payments WHERE order_id=$1),(SELECT amount FROM payments WHERE order_id=$1),(SELECT status FROM payments WHERE order_id=$1) FROM orders WHERE id=$1");c.Parameters.AddWithValue(Guid.Parse(orderId));await using var r=await c.ExecuteReaderAsync(TestContext.Current.CancellationToken);Assert.True(await r.ReadAsync(TestContext.Current.CancellationToken));Assert.Equal("fully_paid",r.GetString(0));Assert.False(r.IsDBNull(1));Assert.Equal(1L,r.GetInt64(2));Assert.Equal("pos_terminal",r.GetString(3));Assert.Equal(412.6m,r.GetDecimal(4));Assert.Equal("completed",r.GetString(5)); }
        public async Task AssertDiscountedStateAsync(string orderId,decimal final,decimal capture,decimal pos,string source) { await AssertA12StateAsync(orderId,1.4m,final,capture,pos);await using var c=data.CreateCommand(source=="promo"?"SELECT COUNT(*),SUM(discount_amount) FROM promo_code_usage WHERE order_id=$1":"SELECT COUNT(*),SUM(amount) FROM first_order_discounts WHERE order_id=$1 AND is_used=TRUE");c.Parameters.AddWithValue(Guid.Parse(orderId));await using var r=await c.ExecuteReaderAsync(TestContext.Current.CancellationToken);Assert.True(await r.ReadAsync(TestContext.Current.CancellationToken));Assert.Equal(1L,r.GetInt64(0));Assert.Equal(1500m,r.GetDecimal(1)); }
        private async Task ExecuteAsync(string sql, params object[] values) { await using var c = data.CreateCommand(sql); foreach (var value in values) c.Parameters.AddWithValue(value); await c.ExecuteNonQueryAsync(TestContext.Current.CancellationToken); }
        private static async Task ResetAsync(string connection) { await using var data = NpgsqlDataSource.Create(connection); foreach (var sql in new[] { "DELETE FROM payments", "DELETE FROM order_status_history", "DELETE FROM order_items", "DELETE FROM orders", "DELETE FROM customers" }) { await using var c = data.CreateCommand(sql); await c.ExecuteNonQueryAsync(TestContext.Current.CancellationToken); } }
        public async ValueTask DisposeAsync() { data.Dispose(); Node.Dispose(); Dotnet.Dispose(); factory.Dispose(); await Task.CompletedTask; }
    }
}
