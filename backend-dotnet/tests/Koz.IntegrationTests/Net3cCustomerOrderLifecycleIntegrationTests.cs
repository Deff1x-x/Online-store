using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Npgsql;
using Xunit;
using Xunit.Sdk;

namespace Koz.IntegrationTests;

[Collection("NodeApi")]
public sealed class Net3cCustomerOrderLifecycleIntegrationTests
{
    [Fact, Trait("Category", "Integration")]
    public async Task MyOrdersListAndDetailParity_final_customer_view_and_sorting()
    {
        await using var scope = await Scope.OpenAsync();
        var customer = await scope.CustomerAsync();
        var older = await scope.OrderAsync(customer.CustomerId, "new", "pending", 2063m, 0m, 412.6m, null);
        var latest = await scope.OrderAsync(customer.CustomerId, "delivered", "fully_paid", 1979.64m, 1650.40m, 329.24m, 1.42m);
        await scope.PaymentAsync(latest, 329.24m);
        await AssertRawParityAsync(await scope.GetAsync(scope.Node.Client, "/api/my-orders", customer.Token), await scope.GetAsync(scope.Dotnet, "/api/my-orders", customer.Token));
        var list = JsonDocument.Parse(await (await scope.GetAsync(scope.Dotnet, "/api/my-orders", customer.Token)).Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal(latest, list.RootElement.GetProperty("orders")[0].GetProperty("id").GetString());
        Assert.Equal("1979.64", list.RootElement.GetProperty("orders")[0].GetProperty("final_total").GetString());
        Assert.Equal("fully_paid", list.RootElement.GetProperty("orders")[0].GetProperty("payment_status").GetString());
        await AssertRawParityAsync(await scope.GetAsync(scope.Node.Client, $"/api/my-orders/{latest}", customer.Token), await scope.GetAsync(scope.Dotnet, $"/api/my-orders/{latest}", customer.Token));
        await AssertRawParityAsync(await scope.GetAsync(scope.Node.Client, $"/api/my-orders/{older}", customer.Token), await scope.GetAsync(scope.Dotnet, $"/api/my-orders/{older}", customer.Token));
    }

    [Fact, Trait("Category", "Integration")]
    public async Task MyOrdersOwnershipNotFoundAndAuthorizationParity()
    {
        await using var scope = await Scope.OpenAsync();
        var owner = await scope.CustomerAsync(); var foreign = await scope.CustomerAsync(); var order = await scope.OrderAsync(owner.CustomerId, "new", "pending", 500m, 0m, 100m, null);
        await AssertRawParityAsync(await scope.GetAsync(scope.Node.Client, $"/api/my-orders/{order}", foreign.Token), await scope.GetAsync(scope.Dotnet, $"/api/my-orders/{order}", foreign.Token));
        await AssertRawParityAsync(await scope.GetAsync(scope.Node.Client, $"/api/my-orders/{Guid.NewGuid()}", owner.Token), await scope.GetAsync(scope.Dotnet, $"/api/my-orders/{Guid.NewGuid()}", owner.Token), false);
        await AssertRawParityAsync(await scope.GetAsync(scope.Node.Client, "/api/my-orders", null), await scope.GetAsync(scope.Dotnet, "/api/my-orders", null));
        await AssertRawParityAsync(await scope.GetAsync(scope.Node.Client, "/api/my-orders", Token(Guid.NewGuid(), "admin_catalog")), await scope.GetAsync(scope.Dotnet, "/api/my-orders", Token(Guid.NewGuid(), "admin_catalog")));
    }

    private static async Task AssertRawParityAsync(HttpResponseMessage node, HttpResponseMessage dotnet, bool sameRequest = true)
    {
        if (node.StatusCode != dotnet.StatusCode) throw new Xunit.Sdk.XunitException($"Node={(int)node.StatusCode} {await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)}; .NET={(int)dotnet.StatusCode} {await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)}");
        Assert.Equal(node.StatusCode, dotnet.StatusCode);
        Assert.Equal(node.Content.Headers.ContentType!.ToString(), dotnet.Content.Headers.ContentType!.ToString());
        if (sameRequest) Assert.Equal(await node.Content.ReadAsStringAsync(), await dotnet.Content.ReadAsStringAsync());
        else { Assert.Equal(HttpStatusCode.NotFound, node.StatusCode); Assert.Equal(await node.Content.ReadAsStringAsync(), await dotnet.Content.ReadAsStringAsync()); }
    }

    private static string Token(Guid id, string role)
    {
        static string B(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var header = B(Encoding.UTF8.GetBytes("{\"alg\":\"HS256\",\"typ\":\"JWT\"}"));
        var payload = B(JsonSerializer.SerializeToUtf8Bytes(new { id = id.ToString(), role, iat = DateTimeOffset.UtcNow.ToUnixTimeSeconds(), exp = DateTimeOffset.UtcNow.AddMinutes(10).ToUnixTimeSeconds() }));
        var input = header + "." + payload;
        return input + "." + B(HMACSHA256.HashData(Encoding.UTF8.GetBytes("net1-testing-jwt-secret-with-at-least-32-characters"), Encoding.UTF8.GetBytes(input)));
    }

    private sealed record Customer(string Token, Guid CustomerId);
    private sealed class Scope : IAsyncDisposable
    {
        private readonly Net1ApiFactory factory; private readonly NpgsqlDataSource data;
        private Scope(Net1ApiFactory factory, HttpClient dotnet, NodeAuthServer node, NpgsqlDataSource data) { this.factory=factory; Dotnet=dotnet; Node=node; this.data=data; }
        public HttpClient Dotnet { get; } public NodeAuthServer Node { get; }
        public static async Task<Scope> OpenAsync()
        {
            var cs=Environment.GetEnvironmentVariable("KOZ_NET3C_TEST_CONNECTION_STRING"); if(string.IsNullOrWhiteSpace(cs)) throw SkipException.ForSkip("Set KOZ_NET3C_TEST_CONNECTION_STRING."); Assert.Equal("koz_dotnet_net3c_test",new NpgsqlConnectionStringBuilder(cs).Database);
            await using var reset=NpgsqlDataSource.Create(cs); foreach(var sql in new[]{"DELETE FROM payments","DELETE FROM order_status_history","DELETE FROM order_items","DELETE FROM orders","DELETE FROM customers WHERE phone LIKE 'n3c%'","DELETE FROM users WHERE phone LIKE 'n3c%'"}) { await using var c=reset.CreateCommand(sql); await c.ExecuteNonQueryAsync(); }
            var factory=new Net1ApiFactory(cs); return new(factory,factory.CreateClient(),await NodeAuthServer.StartAsync(cs,TestContext.Current.CancellationToken),NpgsqlDataSource.Create(cs));
        }
        public async Task<Customer> CustomerAsync()
        {
            var user=Guid.NewGuid();var customer=Guid.NewGuid(); await Exec("INSERT INTO users(id,phone,role) VALUES($1,$2,'customer')",user,"n3c"+Guid.NewGuid().ToString("N")[..20]); await Exec("INSERT INTO customers(id,user_id,store_id,phone,subscription_status) VALUES($1,$2,'11111111-1111-1111-1111-111111111111',$3,'active')",customer,user,"n3c"+Guid.NewGuid().ToString("N")[..20]); return new(Token(user,"customer"),customer);
        }
        public async Task<string> OrderAsync(Guid customer,string delivery,string payment,decimal final,decimal capture,decimal pos,decimal? actual)
        { var id=Guid.NewGuid(); await Exec("INSERT INTO orders(id,order_number,store_id,customer_id,subtotal,online_payment_amount,online_capture_amount,pos_terminal_topup,final_total,total_price,fulfillment_window,delivery_status,payment_status,actual_weight,delivered_at,created_at) VALUES($1,$2,'11111111-1111-1111-1111-111111111111',$3,1563,1650.4,$4,$5,$6,$6,'same_day',$7::delivery_status,$8::order_payment_status,$9,CASE WHEN $7='delivered' THEN NOW() ELSE NULL END,NOW()+($10 * INTERVAL '1 second'))",id,"N3C-"+id.ToString("N")[..12],customer,capture,pos,final,delivery,payment,actual,delivery=="delivered"?2:1); return id.ToString(); }
        public Task PaymentAsync(string order,decimal amount)=>Exec("INSERT INTO payments(order_id,method,amount,status) VALUES($1,'pos_terminal',$2,'completed')",Guid.Parse(order),amount);
        public async Task<HttpResponseMessage> GetAsync(HttpClient client,string path,string? token){var q=new HttpRequestMessage(HttpMethod.Get,path);if(token is not null)q.Headers.Authorization=new AuthenticationHeaderValue("Bearer",token);return await client.SendAsync(q);}
        private async Task Exec(string sql,params object?[] values){await using var c=data.CreateCommand(sql);foreach(var v in values)c.Parameters.AddWithValue(v ?? DBNull.Value);await c.ExecuteNonQueryAsync();}
        public async ValueTask DisposeAsync(){data.Dispose();Node.Dispose();Dotnet.Dispose();factory.Dispose();await Task.CompletedTask;}
    }
}
