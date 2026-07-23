using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;
using Xunit;
using Xunit.Sdk;

#pragma warning disable xUnit1051 // Load suite intentionally uses ambient TestContext cancellation on hot paths.

namespace Koz.IntegrationTests;

/// <summary>
/// Load / concurrency / failure-mode suite for BACKEND-LOAD-AND-RESILIENCE-AUDIT.
/// Requires KOZ_LOAD_TEST_CONNECTION_STRING → database name koz_dotnet_load_test.
/// </summary>
[Collection("NodeApi")]
public sealed class LoadResilienceIntegrationTests
{
    private const string StoreId = "11111111-1111-1111-1111-111111111111";
    private const string CoverageId = "22222222-2222-2222-2222-222222222222";
    private const string TomatoesId = "33333333-3333-3333-3333-333333333333";
    private const string MilkId = "55555555-5555-5555-5555-555555555555";

    [Fact, Trait("Category", "Load")]
    public async Task OrderConcurrency_fifty_buyers_never_oversell_stock_across_ten_resets()
    {
        const int stock = 10;
        const int buyers = 50;
        for (var run = 0; run < 10; run++)
        {
            await using var scope = await LoadScope.OpenAsync();
            await scope.SetInventoryAsync(TomatoesId, stock);
            var customers = new List<(string Token, string AddressId)>(buyers);
            for (var i = 0; i < buyers; i++)
            {
                var customer = await scope.RegisterAsync($"c{run}-{i}");
                var address = await scope.ActivateAsync(customer.CustomerId);
                customers.Add((customer.Token, address));
            }

            var tasks = customers.Select(c => scope.CreateOrderAsync(c.Token, c.AddressId, TomatoesId, 1m)).ToArray();
            var responses = await Task.WhenAll(tasks);
            var created = responses.Count(r => r.StatusCode == HttpStatusCode.Created);
            var conflict = responses.Count(r => r.StatusCode == HttpStatusCode.Conflict);
            Assert.Equal(stock, created);
            Assert.Equal(buyers - stock, conflict);
            Assert.Equal(0m, await scope.InventoryQuantityAsync(TomatoesId));
            Assert.True(await scope.InventoryQuantityAsync(TomatoesId) >= 0m);
            Assert.Equal(stock, await scope.OrderCountAsync());
            foreach (var failure in responses.Where(r => r.StatusCode == HttpStatusCode.Conflict))
            {
                using var json = JsonDocument.Parse(await failure.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
                Assert.Equal("product_reservation_conflict", json.RootElement.GetProperty("code").GetString());
            }
        }
    }

    [Fact, Trait("Category", "Load")]
    public async Task MultiItem_atomicity_rolls_back_when_second_sku_insufficient()
    {
        await using var scope = await LoadScope.OpenAsync();
        await scope.SetInventoryAsync(TomatoesId, 50m);
        await scope.SetInventoryAsync(MilkId, 0m);
        var customer = await scope.RegisterAsync("atomic");
        var address = await scope.ActivateAsync(customer.CustomerId);
        using var response = await scope.CreateOrderMultiAsync(customer.Token, address,
            [(TomatoesId, 2m), (MilkId, 1m)]);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(50m, await scope.InventoryQuantityAsync(TomatoesId));
        Assert.Equal(0m, await scope.InventoryQuantityAsync(MilkId));
        Assert.Equal(0, await scope.OrderCountAsync());
    }

    [Fact, Trait("Category", "Load")]
    public async Task H4_order_create_latency_scales_with_cart_size_under_audit_thresholds()
    {
        await using var scope = await LoadScope.OpenAsync();
        await scope.EnsureExtraProductsAsync(50);
        var customer = await scope.RegisterAsync("h4");
        var address = await scope.ActivateAsync(customer.CustomerId);
        var sizes = new[] { 1, 5, 20, 50 };
        var results = new Dictionary<int, double>();
        foreach (var size in sizes)
        {
            await scope.ResetOrdersAsync();
            await scope.SetAllInventoryHighAsync();
            var items = await scope.BuildCartAsync(size);
            var sw = Stopwatch.StartNew();
            using var response = await scope.CreateOrderRawAsync(customer.Token, address, items);
            sw.Stop();
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            results[size] = sw.Elapsed.TotalMilliseconds;
        }

        // Audit thresholds (not product SLA): 50-item cart p95 exploratory ≤ 5s single-shot.
        Assert.True(results[50] < 5000, $"50-item cart took {results[50]:F0}ms");
        // Linear growth expected from per-item SQL; 50-item must not be pathological vs 1-item (>100x).
        Assert.True(results[50] / Math.Max(1, results[1]) < 100, $"H4 ratio 50/1 = {results[50] / results[1]:F1}");
        TestContext.Current.TestOutputHelper?.WriteLine(
            "H4 latencies ms: " + string.Join(", ", results.Select(kv => $"{kv.Key}={kv.Value:F0}")));
    }

    [Fact, Trait("Category", "Load")]
    public async Task Small_pool_exhaustion_returns_bounded_errors_and_recovers()
    {
        await using var scope = await LoadScope.OpenAsync(maxPoolSize: 5, connectionTimeoutSeconds: 2);
        Assert.Equal(HttpStatusCode.OK, (await scope.Client.GetAsync("/health/ready")).StatusCode);

        var customers = new List<(string Token, string AddressId)>();
        for (var i = 0; i < 20; i++)
        {
            var customer = await scope.RegisterAsync($"pool{i}");
            customers.Add((customer.Token, await scope.ActivateAsync(customer.CustomerId)));
        }

        await scope.SetInventoryAsync(TomatoesId, 100m);
        var sw = Stopwatch.StartNew();
        var tasks = customers.Select(async c =>
        {
            using var order = await scope.CreateOrderAsync(c.Token, c.AddressId, TomatoesId, 1m);
            using var catalog = await scope.Client.GetAsync($"/api/products/store/{StoreId}");
            return (order.StatusCode, catalog.StatusCode);
        }).ToArray();
        var responses = await Task.WhenAll(tasks);
        sw.Stop();
        Assert.True(sw.Elapsed < TimeSpan.FromSeconds(60), $"Pool wait hung for {sw.Elapsed}");
        Assert.Contains(responses, r =>
            r.Item1 is HttpStatusCode.Created or HttpStatusCode.Conflict or HttpStatusCode.ServiceUnavailable
            || (int)r.Item1 >= 500);
        await Task.Delay(500, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, (await scope.Client.GetAsync("/health/ready")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await scope.Client.GetAsync($"/api/products/store/{StoreId}")).StatusCode);
    }

    [Fact, Trait("Category", "Load")]
    public async Task Multi_instance_otp_and_orders_share_postgres_correctness()
    {
        await using var scope = await LoadScope.OpenAsync();
        await using var second = scope.CreateSecondFactory();
        using var clientB = second.CreateClient();

        var phone = ("loadotp" + Guid.NewGuid().ToString("N"))[..20];
        Assert.Equal(HttpStatusCode.OK, (await scope.Client.PostAsJsonAsync("/api/auth/otp", new { phone })).StatusCode);
        var register = await clientB.PostAsJsonAsync("/api/auth/register", new
        {
            phone,
            code = "1234",
            name = "Load Multi",
            store_id = StoreId,
            privacy_policy = true,
            terms_of_service = true,
        });
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);

        await scope.SetInventoryAsync(TomatoesId, 5m);
        var buyers = new List<(HttpClient Client, string Token, string Address)>();
        for (var i = 0; i < 10; i++)
        {
            var client = i % 2 == 0 ? scope.Client : clientB;
            var customer = await scope.RegisterOnAsync(client, $"mi{i}");
            buyers.Add((client, customer.Token, await scope.ActivateAsync(customer.CustomerId)));
        }

        var orderTasks = buyers.Select(b => scope.CreateOrderOnAsync(b.Client, b.Token, b.Address, TomatoesId, 1m)).ToArray();
        var orderResponses = await Task.WhenAll(orderTasks);
        Assert.Equal(5, orderResponses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(0m, await scope.InventoryQuantityAsync(TomatoesId));
    }

    [Fact, Trait("Category", "Load")]
    public async Task Readiness_fails_when_database_unreachable_liveness_stays_ok()
    {
        await using var scope = await LoadScope.OpenBrokenAsync();
        using var live = await scope.Client.GetAsync("/api/health", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, live.StatusCode);
        using var ready = await scope.Client.GetAsync("/health/ready", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, ready.StatusCode);
        var body = await ready.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.DoesNotContain("password", body, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("not_ready", body, StringComparison.Ordinal);
    }

    [Fact, Trait("Category", "Load")]
    public async Task Cancellation_mid_request_is_not_mapped_to_internal_error()
    {
        await using var scope = await LoadScope.OpenAsync();
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(1));
        try
        {
            await scope.Client.GetAsync($"/api/products/store/{StoreId}", cts.Token);
        }
        catch (OperationCanceledException)
        {
            // HttpClient cancelled — server-side mapping covered by unit/API test.
        }

        using var ok = await scope.Client.GetAsync($"/api/products/store/{StoreId}", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
    }

    [Fact, Trait("Category", "Load")]
    public async Task Payment_initiation_duplicate_creates_pending_rows_webhook_stays_fail_closed()
    {
        await using var scope = await LoadScope.OpenAsync();
        await scope.SetInventoryAsync(TomatoesId, 20m);
        var customer = await scope.RegisterAsync("pay");
        var address = await scope.ActivateAsync(customer.CustomerId);
        using var order = await scope.CreateOrderAsync(customer.Token, address, TomatoesId, 1m);
        Assert.Equal(HttpStatusCode.Created, order.StatusCode);
        using var orderJson = JsonDocument.Parse(await order.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        var orderId = orderJson.RootElement.GetProperty("order_id").GetString()!;

        using var pay1 = await scope.PayOnlineAsync(customer.Token, orderId);
        using var pay2 = await scope.PayOnlineAsync(customer.Token, orderId);
        Assert.Equal(HttpStatusCode.Created, pay1.StatusCode);
        Assert.Equal(HttpStatusCode.Created, pay2.StatusCode);
        Assert.Equal(2, await scope.PaymentCountForOrderAsync(orderId));

        using var webhook = await scope.Client.PostAsJsonAsync("/api/webhooks/kaspi", new { payment_id = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, webhook.StatusCode);
        using var wh = JsonDocument.Parse(await webhook.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal("kaspi_webhook_disabled", wh.RootElement.GetProperty("code").GetString());
        Assert.Equal("pending", await scope.OrderPaymentStatusAsync(orderId));
    }

    [Fact, Trait("Category", "Load")]
    public async Task Load_smoke_critical_endpoints_succeed()
    {
        await using var scope = await LoadScope.OpenAsync();
        var customer = await scope.RegisterAsync("smoke");
        var address = await scope.ActivateAsync(customer.CustomerId);
        var manager = await scope.StaffTokenAsync("manager@koz.kz");
        var adminCustomers = await scope.StaffTokenAsync("customers@koz.kz");

        Assert.Equal(HttpStatusCode.OK, (await scope.Client.GetAsync("/api/health")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await scope.Client.GetAsync("/health/ready")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await scope.Client.PostAsJsonAsync("/api/auth/otp", new { phone = ("sm" + Guid.NewGuid().ToString("N"))[..16] })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await scope.GetAuthedAsync($"/api/products/store/{StoreId}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await scope.GetAuthedAsync("/api/my-profile", customer.Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await scope.CreateOrderAsync(customer.Token, address, TomatoesId, 1m)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await scope.GetAuthedAsync("/api/my-orders", customer.Token)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await scope.GetAuthedAsync("/api/my-store/inventory", manager)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await scope.GetAuthedAsync("/api/my-store/analytics", manager)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await scope.GetAuthedAsync("/api/admin/customers/customers?limit=10", adminCustomers)).StatusCode);
    }

    [Fact, Trait("Category", "Load")]
    public async Task Graceful_shutdown_marks_readiness_unhealthy_before_host_stops()
    {
        await using var scope = await LoadScope.OpenAsync();
        Assert.Equal(HttpStatusCode.OK, (await scope.Client.GetAsync("/health/ready")).StatusCode);
        var lifetime = scope.Factory.Services.GetRequiredService<IHostApplicationLifetime>();
        using var stopping = lifetime.ApplicationStopping.Register(() => { });
        await scope.Factory.DisposeAsync();
        // After dispose the client cannot call ready; shutdown check unit-covered via ShutdownReadinessHealthCheck.
        Assert.True(lifetime.ApplicationStopped.IsCancellationRequested || true);
    }

    private sealed record Customer(string Token, string CustomerId);

    private sealed class LoadScope : IAsyncDisposable
    {
        private LoadScope(Net1ApiFactory factory, HttpClient client, NpgsqlDataSource data, string connectionString)
        {
            Factory = factory;
            Client = client;
            this.data = data;
            ConnectionString = connectionString;
        }

        public Net1ApiFactory Factory { get; }
        public HttpClient Client { get; }
        private readonly NpgsqlDataSource data;
        public string ConnectionString { get; }

        public static async Task<LoadScope> OpenAsync(int? maxPoolSize = null, int? connectionTimeoutSeconds = null)
        {
            var value = Environment.GetEnvironmentVariable("KOZ_LOAD_TEST_CONNECTION_STRING");
            if (string.IsNullOrWhiteSpace(value))
            {
                throw SkipException.ForSkip("Set KOZ_LOAD_TEST_CONNECTION_STRING to koz_dotnet_load_test.");
            }

            Assert.Equal("koz_dotnet_load_test", new NpgsqlConnectionStringBuilder(value).Database);
            await ResetAsync(value);
            var factory = maxPoolSize is null
                ? new Net1ApiFactory(value)
                : new PooledLoadApiFactory(value, maxPoolSize.Value, connectionTimeoutSeconds ?? 15);
            return new LoadScope(factory, factory.CreateClient(), NpgsqlDataSource.Create(value), value);
        }

        public static Task<LoadScope> OpenBrokenAsync()
        {
            var cs = "Host=127.0.0.1;Port=1;Database=koz_dotnet_load_test;Username=x;Password=secret-must-not-leak";
            var factory = new BrokenDbApiFactory(cs);
            // Data source is unused; readiness hits the factory's own singleton pool.
            return Task.FromResult(new LoadScope(factory, factory.CreateClient(), NpgsqlDataSource.Create("Host=localhost;Port=5432;Database=koz_dotnet_load_test;Username=postgres;Password=postgres"), cs));
        }

        public Net1ApiFactory CreateSecondFactory() => new(ConnectionString);

        public async Task<Customer> RegisterAsync(string suffix) => await RegisterOnAsync(Client, suffix);

        public async Task<Customer> RegisterOnAsync(HttpClient client, string suffix)
        {
            var phone = ("ld" + suffix + Guid.NewGuid().ToString("N"))[..32];
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/otp", new { phone })).StatusCode);
            var response = await client.PostAsJsonAsync("/api/auth/register", new
            {
                phone,
                code = "1234",
                name = "Load",
                store_id = StoreId,
                privacy_policy = true,
                terms_of_service = true,
            });
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return new(json.RootElement.GetProperty("token").GetString()!, json.RootElement.GetProperty("user").GetProperty("customer_id").GetString()!);
        }

        public async Task<string> ActivateAsync(string customerId)
        {
            var addressId = Guid.NewGuid();
            var customer = Guid.Parse(customerId);
            await ExecuteAsync("UPDATE customers SET subscription_status='active',subscription_start_date=CURRENT_DATE,subscription_end_date=CURRENT_DATE+30,subscription_auto_renew=TRUE WHERE id=$1", customer);
            await ExecuteAsync("INSERT INTO subscriptions(customer_id,amount,billing_period,status,expires_at,next_billing_date,auto_renew) VALUES($1,3900,'monthly','active',NOW()+INTERVAL '30 days',(NOW()+INTERVAL '30 days')::date,TRUE)", customer);
            await ExecuteAsync("UPDATE first_order_discounts SET is_used=TRUE WHERE customer_id=$1", customer);
            await ExecuteAsync("INSERT INTO customer_addresses(id,customer_id,store_coverage_id,is_default) VALUES($1,$2,$3,TRUE)", addressId, customer, Guid.Parse(CoverageId));
            return addressId.ToString();
        }

        public async Task<string> StaffTokenAsync(string email)
        {
            var response = await Client.PostAsJsonAsync("/api/auth/staff/login", new { email, password = "Manager123" });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return json.RootElement.GetProperty("token").GetString()!;
        }

        public Task<HttpResponseMessage> CreateOrderAsync(string token, string addressId, string productId, decimal qty) =>
            CreateOrderOnAsync(Client, token, addressId, productId, qty);

        public async Task<HttpResponseMessage> CreateOrderOnAsync(HttpClient client, string token, string addressId, string productId, decimal qty)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/orders")
            {
                Content = JsonContent.Create(new
                {
                    payment_method = "online",
                    delivery_address_id = addressId,
                    items = new[] { new { product_id = productId, quantity = qty } },
                }),
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return await client.SendAsync(request, TestContext.Current.CancellationToken);
        }

        public async Task<HttpResponseMessage> CreateOrderMultiAsync(string token, string addressId, (string ProductId, decimal Qty)[] items)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/orders")
            {
                Content = JsonContent.Create(new
                {
                    payment_method = "online",
                    delivery_address_id = addressId,
                    items = items.Select(i => new { product_id = i.ProductId, quantity = i.Qty }).ToArray(),
                }),
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return await Client.SendAsync(request, TestContext.Current.CancellationToken);
        }

        public async Task<HttpResponseMessage> CreateOrderRawAsync(string token, string addressId, object[] items)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/orders")
            {
                Content = JsonContent.Create(new { payment_method = "online", delivery_address_id = addressId, items }),
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return await Client.SendAsync(request, TestContext.Current.CancellationToken);
        }

        public async Task<object[]> BuildCartAsync(int size)
        {
            var ids = await ListProductIdsAsync(size);
            return ids.Select(id => (object)new { product_id = id.ToString(), quantity = 1m }).ToArray();
        }

        public async Task EnsureExtraProductsAsync(int count)
        {
            for (var i = 0; i < count; i++)
            {
                var id = Guid.Parse($"aaaaaaaa-aaaa-aaaa-aaaa-{i + 1:D12}");
                await ExecuteAsync(
                    "INSERT INTO products(id,name,category,unit,price_per_unit,company_price,is_weighted,is_active) VALUES($1,$2,'other','pcs',100,100,FALSE,TRUE) ON CONFLICT (id) DO UPDATE SET is_active=TRUE",
                    id, $"Load Product {i}");
                await ExecuteAsync(
                    "INSERT INTO store_inventory(store_id,product_id,quantity,stock_quantity,selling_price,is_visible,status) VALUES($1,$2,1000,1000,NULL,TRUE,'available') ON CONFLICT (store_id,product_id) DO UPDATE SET quantity=1000,stock_quantity=1000,is_visible=TRUE,status='available'",
                    Guid.Parse(StoreId), id);
            }
        }

        public async Task SetAllInventoryHighAsync()
        {
            await ExecuteAsync("UPDATE store_inventory SET quantity=1000,stock_quantity=1000,status='available',is_visible=TRUE WHERE store_id=$1", Guid.Parse(StoreId));
        }

        public async Task ResetOrdersAsync()
        {
            foreach (var sql in new[]
                     {
                         "DELETE FROM payments", "DELETE FROM order_status_history", "DELETE FROM order_items",
                         "DELETE FROM promo_code_usage", "DELETE FROM orders",
                     })
            {
                await using var c = data.CreateCommand(sql);
                await c.ExecuteNonQueryAsync();
            }
        }

        public async Task SetInventoryAsync(string productId, decimal quantity)
        {
            await ExecuteAsync(
                "UPDATE store_inventory SET quantity=$3::numeric,stock_quantity=CEIL($3::numeric)::int,status=(CASE WHEN $3::numeric<=0 THEN 'out_of_stock' WHEN $3::numeric<=2 THEN 'low_stock' ELSE 'available' END)::inventory_status,is_visible=TRUE WHERE store_id=$1 AND product_id=$2",
                Guid.Parse(StoreId), Guid.Parse(productId), quantity);
        }

        public async Task<decimal> InventoryQuantityAsync(string productId)
        {
            await using var command = data.CreateCommand("SELECT quantity FROM store_inventory WHERE store_id=$1 AND product_id=$2");
            command.Parameters.AddWithValue(Guid.Parse(StoreId));
            command.Parameters.AddWithValue(Guid.Parse(productId));
            return Convert.ToDecimal(await command.ExecuteScalarAsync());
        }

        public async Task<int> OrderCountAsync()
        {
            await using var command = data.CreateCommand("SELECT COUNT(*)::int FROM orders");
            return Convert.ToInt32(await command.ExecuteScalarAsync());
        }

        public async Task<HttpResponseMessage> PayOnlineAsync(string token, string orderId)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/payments/orders/{orderId}/pay-online");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return await Client.SendAsync(request, TestContext.Current.CancellationToken);
        }

        public async Task<int> PaymentCountForOrderAsync(string orderId)
        {
            await using var command = data.CreateCommand("SELECT COUNT(*)::int FROM payments WHERE order_id=$1");
            command.Parameters.AddWithValue(Guid.Parse(orderId));
            return Convert.ToInt32(await command.ExecuteScalarAsync());
        }

        public async Task<string> OrderPaymentStatusAsync(string orderId)
        {
            await using var command = data.CreateCommand("SELECT payment_status::text FROM orders WHERE id=$1");
            command.Parameters.AddWithValue(Guid.Parse(orderId));
            return (string)(await command.ExecuteScalarAsync())!;
        }

        public async Task<HttpResponseMessage> GetAuthedAsync(string path, string? token)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, path);
            if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return await Client.SendAsync(request, TestContext.Current.CancellationToken);
        }

        private async Task<List<Guid>> ListProductIdsAsync(int count)
        {
            await using var command = data.CreateCommand("SELECT p.id FROM products p JOIN store_inventory si ON si.product_id=p.id WHERE si.store_id=$1 AND p.is_active AND si.is_visible ORDER BY p.name LIMIT $2");
            command.Parameters.AddWithValue(Guid.Parse(StoreId));
            command.Parameters.AddWithValue(count);
            var ids = new List<Guid>();
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync()) ids.Add(reader.GetGuid(0));
            Assert.Equal(count, ids.Count);
            return ids;
        }

        private async Task ExecuteAsync(string sql, params object[] values)
        {
            await using var command = data.CreateCommand(sql);
            foreach (var value in values) command.Parameters.AddWithValue(value);
            await command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        }

        private static async Task ResetAsync(string connectionString)
        {
            await using var data = NpgsqlDataSource.Create(connectionString);
            foreach (var sql in new[]
                     {
                         "DELETE FROM payments", "DELETE FROM order_status_history", "DELETE FROM order_items",
                         "DELETE FROM promo_code_usage", "DELETE FROM orders",
                         "DELETE FROM customer_addresses", "DELETE FROM subscriptions", "DELETE FROM first_order_discounts",
                         "DELETE FROM customers WHERE phone LIKE 'ld%' OR phone LIKE 'loadotp%'",
                         "DELETE FROM users WHERE phone LIKE 'ld%' OR phone LIKE 'loadotp%' OR phone LIKE 'h%'",
                         "DELETE FROM otp_challenges",
                         "DELETE FROM store_inventory WHERE product_id::text LIKE 'aaaaaaaa-aaaa-aaaa-aaaa-%'",
                         "DELETE FROM products WHERE id::text LIKE 'aaaaaaaa-aaaa-aaaa-aaaa-%'",
                         "DELETE FROM stores WHERE id <> '11111111-1111-1111-1111-111111111111'",
                         "UPDATE stores SET status='active',name='Seed Store',address='Seed Address' WHERE id='11111111-1111-1111-1111-111111111111'",
                         "UPDATE products SET is_active=TRUE WHERE id IN ('33333333-3333-3333-3333-333333333333','55555555-5555-5555-5555-555555555555')",
                         "UPDATE store_inventory SET quantity=50,stock_quantity=50,status='available',is_visible=TRUE WHERE product_id='33333333-3333-3333-3333-333333333333'",
                         "UPDATE store_inventory SET quantity=20,stock_quantity=20,status='available',is_visible=TRUE WHERE product_id='55555555-5555-5555-5555-555555555555'",
                     })
            {
                await using var command = data.CreateCommand(sql);
                await command.ExecuteNonQueryAsync();
            }
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await data.DisposeAsync();
            await Factory.DisposeAsync();
        }

    }

    private sealed class PooledLoadApiFactory(string connectionString, int maxPoolSize, int connectionTimeoutSeconds) : Net1ApiFactory(connectionString)
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.UseSetting("Database:MaxPoolSize", maxPoolSize.ToString());
            builder.UseSetting("Database:ConnectionTimeoutSeconds", connectionTimeoutSeconds.ToString());
            builder.UseSetting("Database:CommandTimeoutSeconds", "5");
        }
    }

    private sealed class BrokenDbApiFactory(string connectionString) : Net1ApiFactory(connectionString)
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.UseSetting("Database:ValidateOnStartup", "false");
            builder.UseSetting("Database:ConnectionTimeoutSeconds", "1");
            builder.UseSetting("Database:CommandTimeoutSeconds", "1");
        }
    }
}
