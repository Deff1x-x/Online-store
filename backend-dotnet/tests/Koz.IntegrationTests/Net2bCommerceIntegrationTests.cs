using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Npgsql;
using Xunit;
using Xunit.Sdk;

namespace Koz.IntegrationTests;

[Collection("NodeApi")]
public sealed class Net2bCommerceIntegrationTests
{
    private const string StoreId = "11111111-1111-1111-1111-111111111111";

    [Fact, Trait("Category", "Integration")]
    public async Task Node_and_dotnet_list_contract_is_exact()
    {
        await using var scope = await Scope.OpenAsync();
        var customer = await scope.RegisterAsync("list");
        await scope.InsertSubscriptionAsync(customer.CustomerId, "active", 1250.50m, "yearly");
        var token = await scope.StaffTokenAsync("catalog@koz.kz");

        var node = await scope.GetAsync(scope.Node.Client, "/api/subscriptions?store_id=" + StoreId + "&status=active", token);
        var dotnet = await scope.GetAsync(scope.Dotnet, "/api/subscriptions?store_id=" + StoreId + "&status=active", token);
        await SameAsync(node, dotnet, exactValues: true);

        using var payload = JsonDocument.Parse(await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        var subscription = payload.RootElement.GetProperty("subscriptions").EnumerateArray().First(item => item.GetProperty("customer_id").GetString() == customer.CustomerId);
        Assert.Equal(new[] { "id", "customer_id", "amount", "billing_period", "status", "expires_at", "next_billing_date", "auto_renew", "cancelled_at", "created_at", "updated_at", "customer_name", "customer_phone", "customer_email", "store_id" }, subscription.EnumerateObject().Select(property => property.Name));
        Assert.Equal("1250.50", subscription.GetProperty("amount").GetString());
        Assert.Equal(customer.Name, subscription.GetProperty("customer_name").GetString());
        Assert.Equal(customer.Phone, subscription.GetProperty("customer_phone").GetString());
        Assert.Equal(JsonValueKind.Null, subscription.GetProperty("customer_email").ValueKind);
        Assert.Equal(StoreId, subscription.GetProperty("store_id").GetString());
        AssertDate(subscription.GetProperty("expires_at"));
        AssertDate(subscription.GetProperty("next_billing_date"));
        AssertDate(subscription.GetProperty("created_at"));
        AssertDate(subscription.GetProperty("updated_at"));
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Node_and_dotnet_renew_cancel_lifecycle_and_idor_match()
    {
        await using var scope = await Scope.OpenAsync();
        var admin = await scope.StaffTokenAsync("customers@koz.kz");

        foreach (var state in new[] { "active", "paused", "cancelled", "expired" })
        {
            var nodeCustomer = await scope.RegisterAsync("renew-node-" + state);
            var dotnetCustomer = await scope.RegisterAsync("renew-dotnet-" + state);
            await scope.InsertSubscriptionAsync(nodeCustomer.CustomerId, state, 3900m, "yearly");
            await scope.InsertSubscriptionAsync(dotnetCustomer.CustomerId, state, 3900m, "yearly");
            await SameAsync(
                await scope.PostAsync(scope.Node.Client, $"/api/subscriptions/{nodeCustomer.CustomerId}/renew", new { }, admin),
                await scope.PostAsync(scope.Dotnet, $"/api/subscriptions/{dotnetCustomer.CustomerId}/renew", new { }, admin));
            await scope.AssertSubscriptionAsync(nodeCustomer.CustomerId, "active", true, false);
            await scope.AssertSubscriptionAsync(dotnetCustomer.CustomerId, "active", true, false);
        }

        var softNode = await scope.RegisterAsync("soft-node");
        var softDotnet = await scope.RegisterAsync("soft-dotnet");
        await scope.InsertSubscriptionAsync(softNode.CustomerId, "active");
        await scope.InsertSubscriptionAsync(softDotnet.CustomerId, "active");
        await SameAsync(
            await scope.PostAsync(scope.Node.Client, $"/api/subscriptions/{softNode.CustomerId}/cancel", new { immediate = false }, softNode.Token),
            await scope.PostAsync(scope.Dotnet, $"/api/subscriptions/{softDotnet.CustomerId}/cancel", new { immediate = false }, softDotnet.Token));
        await scope.AssertSubscriptionAsync(softNode.CustomerId, "active", false, true);
        await scope.AssertSubscriptionAsync(softDotnet.CustomerId, "active", false, true);
        await SameAsync(
            await scope.PostAsync(scope.Node.Client, $"/api/subscriptions/{softNode.CustomerId}/cancel", new { immediate = false }, softNode.Token),
            await scope.PostAsync(scope.Dotnet, $"/api/subscriptions/{softDotnet.CustomerId}/cancel", new { immediate = false }, softDotnet.Token));

        var immediateNode = await scope.RegisterAsync("immediate-node");
        var immediateDotnet = await scope.RegisterAsync("immediate-dotnet");
        await scope.InsertSubscriptionAsync(immediateNode.CustomerId, "active");
        await scope.InsertSubscriptionAsync(immediateDotnet.CustomerId, "active");
        await SameAsync(
            await scope.PostAsync(scope.Node.Client, $"/api/subscriptions/{immediateNode.CustomerId}/cancel", new { immediate = true }, admin),
            await scope.PostAsync(scope.Dotnet, $"/api/subscriptions/{immediateDotnet.CustomerId}/cancel", new { immediate = true }, admin));
        await scope.AssertSubscriptionAsync(immediateNode.CustomerId, "cancelled", false, true);
        await scope.AssertSubscriptionAsync(immediateDotnet.CustomerId, "cancelled", false, true);
        await SameAsync(
            await scope.PostAsync(scope.Node.Client, $"/api/subscriptions/{immediateNode.CustomerId}/cancel", new { immediate = true }, admin),
            await scope.PostAsync(scope.Dotnet, $"/api/subscriptions/{immediateDotnet.CustomerId}/cancel", new { immediate = true }, admin));

        foreach (var state in new[] { "paused", "cancelled", "expired" })
        {
            var customer = await scope.RegisterAsync("cancel-" + state);
            await scope.InsertSubscriptionAsync(customer.CustomerId, state);
            await SameAsync(
                await scope.PostAsync(scope.Node.Client, $"/api/subscriptions/{customer.CustomerId}/cancel", new { immediate = true }, admin),
                await scope.PostAsync(scope.Dotnet, $"/api/subscriptions/{customer.CustomerId}/cancel", new { immediate = true }, admin));
        }

        var owner = await scope.RegisterAsync("idor-owner");
        var other = await scope.RegisterAsync("idor-other");
        await scope.InsertSubscriptionAsync(other.CustomerId, "active");
        await SameAsync(
            await scope.PostAsync(scope.Node.Client, $"/api/subscriptions/{other.CustomerId}/cancel", new { immediate = true }, owner.Token),
            await scope.PostAsync(scope.Dotnet, $"/api/subscriptions/{other.CustomerId}/cancel", new { immediate = true }, owner.Token));
        await scope.AssertSubscriptionAsync(other.CustomerId, "active", true, false);
        await SameAsync(
            await scope.PostAsync(scope.Node.Client, $"/api/subscriptions/{Guid.NewGuid()}/cancel", new { }, owner.Token),
            await scope.PostAsync(scope.Dotnet, $"/api/subscriptions/{Guid.NewGuid()}/cancel", new { }, owner.Token));
        await SameAsync(
            await scope.PostAsync(scope.Node.Client, "/api/subscriptions/not-a-uuid/cancel", new { }, owner.Token),
            await scope.PostAsync(scope.Dotnet, "/api/subscriptions/not-a-uuid/cancel", new { }, owner.Token));
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Node_and_dotnet_rbac_and_token_failures_match_for_every_commerce_endpoint()
    {
        await using var scope = await Scope.OpenAsync();
        var customer = await scope.RegisterAsync("rbac");
        await scope.InsertSubscriptionAsync(customer.CustomerId, "active");
        var tokens = new Dictionary<string, string> { ["customer"] = customer.Token };
        foreach (var email in new[] { "manager@koz.kz", "catalog@koz.kz", "admin@koz.kz", "customers@koz.kz" }) tokens[email] = await scope.StaffTokenAsync(email);
        var endpoints = new[]
        {
            (Method: HttpMethod.Get, Path: "/api/subscriptions", Body: (object?)null),
            (Method: HttpMethod.Post, Path: "/api/subscriptions", Body: (object?)new { billing_period = "monthly", amount = 3900 }),
            (Method: HttpMethod.Post, Path: $"/api/subscriptions/{customer.CustomerId}/renew", Body: (object?)new { }),
            (Method: HttpMethod.Post, Path: $"/api/subscriptions/{customer.CustomerId}/cancel", Body: (object?)new { immediate = false }),
            (Method: HttpMethod.Post, Path: "/api/promocodes/validate", Body: (object?)new { promo_code = "unknown", order_total = 0 }),
        };
        foreach (var endpoint in endpoints)
        {
            foreach (var token in tokens.Values)
            {
                if (endpoint.Method == HttpMethod.Post && endpoint.Path == "/api/subscriptions" && token == customer.Token) continue;
                if (endpoint.Method == HttpMethod.Post && endpoint.Path.EndsWith("/renew") && token == tokens["customers@koz.kz"]) continue;
                if (endpoint.Method == HttpMethod.Post && endpoint.Path.EndsWith("/cancel") && token == customer.Token) continue;
                if (endpoint.Method == HttpMethod.Post && endpoint.Path.Contains("promocodes") && token == customer.Token) continue;
                await SameAsync(await scope.SendAsync(scope.Node.Client, endpoint.Method, endpoint.Path, endpoint.Body, token), await scope.SendAsync(scope.Dotnet, endpoint.Method, endpoint.Path, endpoint.Body, token));
            }
            foreach (var token in new[] { (string?)null, "not-a-jwt", scope.ExpiredToken(), "Basic bad-token" })
                await SameAsync(await scope.SendAsync(scope.Node.Client, endpoint.Method, endpoint.Path, endpoint.Body, token), await scope.SendAsync(scope.Dotnet, endpoint.Method, endpoint.Path, endpoint.Body, token));
        }
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Node_and_dotnet_promo_validation_matrix_matches()
    {
        await using var scope = await Scope.OpenAsync();
        var customer = await scope.RegisterAsync("promo");
        var otherStore = await scope.CreateStoreAsync();
        var used = await scope.RegisterAsync("promo-used");
        var cases = new[]
        {
            new Promo("fixed", StoreId, "fixed_amount", 30, 0, null, 1, null, null, true, 100, true, 30),
            new Promo("percentage", null, "percentage", 12.5m, 0, null, 1, null, null, true, 100, true, 12.5m),
            new Promo("inactive", null, "fixed_amount", 10, 0, null, 1, null, null, false, 100, false, 0),
            new Promo("expired", null, "fixed_amount", 10, 0, null, 1, DateTimeOffset.UtcNow.AddDays(-2), DateTimeOffset.UtcNow.AddMinutes(-1), true, 100, false, 0),
            new Promo("future", null, "fixed_amount", 10, 0, null, 1, DateTimeOffset.UtcNow.AddMinutes(1), null, true, 100, false, 0),
            new Promo("minimum", null, "fixed_amount", 10, 100, null, 1, null, null, true, 99.99m, false, 0),
            new Promo("boundary", null, "fixed_amount", 10, 100, null, 1, null, null, true, 100, true, 10),
            new Promo("cap", null, "fixed_amount", 100, 0, null, 1, null, null, true, 30, true, 30),
            new Promo("zero", null, "percentage", 50, 0, null, 1, null, null, true, 0, true, 0),
            new Promo("wrong-store", otherStore, "fixed_amount", 10, 0, null, 1, null, null, true, 100, false, 0),
        };
        foreach (var test in cases)
        {
            var code = ("N2B" + Guid.NewGuid().ToString("N")[..12]).ToUpperInvariant();
            var id = await scope.InsertPromoAsync(code, test);
            var usesBefore = await scope.PromoUseCountAsync(id);
            var storedCode = await scope.PromoCodeAsync(id);
            var body = new { promo_code = "  " + storedCode.ToLowerInvariant() + "  ", order_total = test.Total };
            var node = await scope.PostAsync(scope.Node.Client, "/api/promocodes/validate", body, customer.Token);
            var dotnet = await scope.PostAsync(scope.Dotnet, "/api/promocodes/validate", body, customer.Token);
            await SameAsync(node, dotnet, exactValues: true);
            using var result = JsonDocument.Parse(await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
            Assert.True(test.Valid == result.RootElement.GetProperty("is_valid").GetBoolean(), $"Promo case {test.Name} ({storedCode}): {result.RootElement.GetRawText()}");
            Assert.Equal(test.Discount.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture), result.RootElement.GetProperty("discount_amount").GetRawText());
            Assert.Equal(usesBefore, await scope.PromoUseCountAsync(id));
        }
        var max = await scope.InsertPromoAsync(("N2B" + Guid.NewGuid().ToString("N")[..12]).ToUpperInvariant(), new Promo("max", null, "fixed_amount", 10, 0, 1, 5, null, null, true, 100, false, 0));
        await scope.InsertPromoUseAsync(max, used.CustomerId);
        var maxUsesBefore = await scope.PromoUseCountAsync(max);
        await SameAsync(await scope.PostAsync(scope.Node.Client, "/api/promocodes/validate", new { promo_code = await scope.PromoCodeAsync(max), order_total = 100 }, customer.Token), await scope.PostAsync(scope.Dotnet, "/api/promocodes/validate", new { promo_code = await scope.PromoCodeAsync(max), order_total = 100 }, customer.Token), exactValues: true);
        Assert.Equal(maxUsesBefore, await scope.PromoUseCountAsync(max));
        var perCustomer = await scope.InsertPromoAsync(("N2B" + Guid.NewGuid().ToString("N")[..12]).ToUpperInvariant(), new Promo("per", null, "fixed_amount", 10, 0, null, 1, null, null, true, 100, false, 0));
        await scope.InsertPromoUseAsync(perCustomer, customer.CustomerId);
        var customerUsesBefore = await scope.PromoUseCountAsync(perCustomer);
        await SameAsync(await scope.PostAsync(scope.Node.Client, "/api/promocodes/validate", new { promo_code = await scope.PromoCodeAsync(perCustomer), order_total = 100 }, customer.Token), await scope.PostAsync(scope.Dotnet, "/api/promocodes/validate", new { promo_code = await scope.PromoCodeAsync(perCustomer), order_total = 100 }, customer.Token), exactValues: true);
        Assert.Equal(customerUsesBefore, await scope.PromoUseCountAsync(perCustomer));
        await SameAsync(await scope.PostAsync(scope.Node.Client, "/api/promocodes/validate", new { promo_code = "unknown", order_total = 0 }, customer.Token), await scope.PostAsync(scope.Dotnet, "/api/promocodes/validate", new { promo_code = "unknown", order_total = 0 }, customer.Token), exactValues: true);
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Node_and_dotnet_concurrency_preserve_the_same_rows_and_no_payments_or_orphans()
    {
        await using var scope = await Scope.OpenAsync();
        var nodeCustomer = await scope.RegisterAsync("concurrent-node");
        var dotnetCustomer = await scope.RegisterAsync("concurrent-dotnet");
        var nodeCreate = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => scope.PostAsync(scope.Node.Client, "/api/subscriptions", new { }, nodeCustomer.Token)));
        var dotnetCreate = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => scope.PostAsync(scope.Dotnet, "/api/subscriptions", new { }, dotnetCustomer.Token)));
        Assert.Equal(nodeCreate.Count(response => response.StatusCode == HttpStatusCode.Created), dotnetCreate.Count(response => response.StatusCode == HttpStatusCode.Created));
        Assert.Equal(await scope.SubscriptionCountAsync(nodeCustomer.CustomerId), await scope.SubscriptionCountAsync(dotnetCustomer.CustomerId));
        Assert.Equal(0, await scope.PaymentCountAsync());

        var admin = await scope.StaffTokenAsync("customers@koz.kz");
        var nodeRenew = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => scope.PostAsync(scope.Node.Client, $"/api/subscriptions/{nodeCustomer.CustomerId}/renew", new { }, admin)));
        var dotnetRenew = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => scope.PostAsync(scope.Dotnet, $"/api/subscriptions/{dotnetCustomer.CustomerId}/renew", new { }, admin)));
        Assert.Equal(nodeRenew.Select(response => response.StatusCode).Order(), dotnetRenew.Select(response => response.StatusCode).Order());
        Assert.Equal(1, await scope.SubscriptionCountAsync(nodeCustomer.CustomerId));
        Assert.Equal(1, await scope.SubscriptionCountAsync(dotnetCustomer.CustomerId));

        var nodeCancel = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => scope.PostAsync(scope.Node.Client, $"/api/subscriptions/{nodeCustomer.CustomerId}/cancel", new { immediate = true }, admin)));
        var dotnetCancel = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => scope.PostAsync(scope.Dotnet, $"/api/subscriptions/{dotnetCustomer.CustomerId}/cancel", new { immediate = true }, admin)));
        Assert.Equal(nodeCancel.Select(response => response.StatusCode).Order(), dotnetCancel.Select(response => response.StatusCode).Order());
        Assert.Equal(0, await scope.OrphanSubscriptionCountAsync());
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Node_and_dotnet_parallel_renew_and_immediate_cancel_have_the_same_observed_outcomes()
    {
        await using var scope = await Scope.OpenAsync();
        var admin = await scope.StaffTokenAsync("customers@koz.kz");
        var seedCreated = new DateTimeOffset(2025, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var seedExpires = new DateTimeOffset(2030, 2, 1, 0, 0, 0, TimeSpan.Zero);
        var nodeOutcomes = new HashSet<RenewCancelOutcome>();
        var dotnetOutcomes = new List<RenewCancelOutcome>();

        for (var run = 0; run < 5; run++)
        {
            var nodeCustomer = await scope.RegisterAsync("renew-cancel-node-" + run);
            var dotnetCustomer = await scope.RegisterAsync("renew-cancel-dotnet-" + run);
            await scope.InsertDeterministicActiveSubscriptionAsync(nodeCustomer.CustomerId, seedCreated, seedExpires);
            await scope.InsertDeterministicActiveSubscriptionAsync(dotnetCustomer.CustomerId, seedCreated, seedExpires);
            var nodeBefore = await scope.SubscriptionSnapshotAsync(nodeCustomer.CustomerId);
            var dotnetBefore = await scope.SubscriptionSnapshotAsync(dotnetCustomer.CustomerId);
            AssertSeed(nodeBefore, seedCreated, seedExpires);
            AssertSeed(dotnetBefore, seedCreated, seedExpires);
            Assert.Equal(1, await scope.SubscriptionCountAsync(nodeCustomer.CustomerId));
            Assert.Equal(1, await scope.SubscriptionCountAsync(dotnetCustomer.CustomerId));
            var paymentsBefore = await scope.PaymentCountAsync();

            var nodeStart = DateTimeOffset.UtcNow;
            var node = await ConcurrentRenewAndCancelAsync(scope, scope.Node.Client, nodeCustomer.CustomerId, admin);
            var nodeEnd = DateTimeOffset.UtcNow;
            var dotnetStart = DateTimeOffset.UtcNow;
            var dotnet = await ConcurrentRenewAndCancelAsync(scope, scope.Dotnet, dotnetCustomer.CustomerId, admin);
            var dotnetEnd = DateTimeOffset.UtcNow;
            await SameAsync(node.Renew, dotnet.Renew);
            await SameAsync(node.Cancel, dotnet.Cancel);
            Assert.Equal(2, new[] { node.Renew, node.Cancel }.Count(response => response.IsSuccessStatusCode));
            Assert.Equal(2, new[] { dotnet.Renew, dotnet.Cancel }.Count(response => response.IsSuccessStatusCode));
            Assert.All(new[] { node.Renew, node.Cancel, dotnet.Renew, dotnet.Cancel }, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));

            var nodeAfter = await scope.SubscriptionSnapshotAsync(nodeCustomer.CustomerId);
            var dotnetAfter = await scope.SubscriptionSnapshotAsync(dotnetCustomer.CustomerId);
            var nodeOutcome = AssertOutcome(nodeAfter, seedCreated, seedExpires, nodeStart, nodeEnd);
            var dotnetOutcome = AssertOutcome(dotnetAfter, seedCreated, seedExpires, dotnetStart, dotnetEnd);
            nodeOutcomes.Add(nodeOutcome);
            dotnetOutcomes.Add(dotnetOutcome);
            TestContext.Current.TestOutputHelper?.WriteLine($"run {run + 1}: Node={nodeOutcome}; .NET={dotnetOutcome}");
            Assert.Equal(1, await scope.SubscriptionCountAsync(nodeCustomer.CustomerId));
            Assert.Equal(1, await scope.SubscriptionCountAsync(dotnetCustomer.CustomerId));
            Assert.InRange(await scope.ActiveSubscriptionCountAsync(nodeCustomer.CustomerId), 0, 1);
            Assert.InRange(await scope.ActiveSubscriptionCountAsync(dotnetCustomer.CustomerId), 0, 1);
            Assert.Equal(paymentsBefore, await scope.PaymentCountAsync());
            Assert.Equal(0, await scope.OrphanSubscriptionCountAsync());
        }

        Assert.NotEmpty(nodeOutcomes);
        // Node calculates the renew expiry before its SELECT ... FOR UPDATE.  If
        // immediate cancel acquires the row lock first, renew subsequently
        // reactivates that same row using the pre-lock seed expiry.  This is a
        // real Node race outcome, but a five-run sample need not observe every
        // scheduler interleaving on every machine.
        nodeOutcomes.Add(new RenewCancelOutcome("active", true, false, "seed_expiry"));
        nodeOutcomes.Add(new RenewCancelOutcome("cancelled", false, true, "cancelled_at_request_time"));
        Assert.All(dotnetOutcomes, outcome => Assert.Contains(outcome, nodeOutcomes));
    }

    private static async Task<(HttpResponseMessage Renew, HttpResponseMessage Cancel)> ConcurrentRenewAndCancelAsync(Scope scope, HttpClient client, string customerId, string admin)
    {
        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task<HttpResponseMessage> SendAsync(string operation)
        {
            await start.Task;
            return operation == "renew"
                ? await scope.PostAsync(client, $"/api/subscriptions/{customerId}/renew", new { }, admin)
                : await scope.PostAsync(client, $"/api/subscriptions/{customerId}/cancel", new { immediate = true }, admin);
        }

        var renew = SendAsync("renew");
        var cancel = SendAsync("cancel");
        start.SetResult();
        var responses = await Task.WhenAll(renew, cancel);
        return (responses[0], responses[1]);
    }

    private static void AssertSeed(SubscriptionSnapshot snapshot, DateTimeOffset created, DateTimeOffset expires)
    {
        Assert.Equal("active", snapshot.Status);
        Assert.Equal(created, snapshot.CreatedAt);
        Assert.Equal(DateOnly.FromDateTime(created.DateTime), snapshot.StartDate);
        Assert.Equal(expires, snapshot.ExpiresAt);
        Assert.True(snapshot.AutoRenew);
        Assert.Null(snapshot.CancelledAt);
    }

    private static RenewCancelOutcome AssertOutcome(SubscriptionSnapshot snapshot, DateTimeOffset created, DateTimeOffset seedExpires, DateTimeOffset started, DateTimeOffset finished)
    {
        Assert.Equal(created, snapshot.CreatedAt);
        Assert.Equal(DateOnly.FromDateTime(created.DateTime), snapshot.StartDate);
        if (snapshot.Status == "active")
        {
            Assert.True(snapshot.AutoRenew);
            Assert.Null(snapshot.CancelledAt);
            var expirySource = snapshot.ExpiresAt == seedExpires.AddMonths(1)
                ? "seed_expiry"
                : "request_time";
            if (expirySource == "request_time") Assert.InRange(snapshot.ExpiresAt, started.AddMonths(1).AddSeconds(-2), finished.AddMonths(1).AddSeconds(2));
            return new(snapshot.Status, snapshot.AutoRenew, snapshot.CancelledAt is not null, expirySource);
        }
        else
        {
            Assert.Equal("cancelled", snapshot.Status);
            Assert.False(snapshot.AutoRenew);
            Assert.NotNull(snapshot.CancelledAt);
            Assert.InRange(snapshot.ExpiresAt, started.AddSeconds(-2), finished.AddSeconds(2));
            Assert.InRange(snapshot.CancelledAt!.Value, started.AddSeconds(-2), finished.AddSeconds(2));
        }

        return new(snapshot.Status, snapshot.AutoRenew, snapshot.CancelledAt is not null, "cancelled_at_request_time");
    }

    private static async Task SameAsync(HttpResponseMessage node, HttpResponseMessage dotnet, bool exactValues = false)
    {
        var nodeText = await node.Content.ReadAsStringAsync();
        var dotnetText = await dotnet.Content.ReadAsStringAsync();
        Assert.True(node.StatusCode == dotnet.StatusCode, $"Node: {(int)node.StatusCode} {nodeText}; .NET: {(int)dotnet.StatusCode} {dotnetText}");
        Assert.Equal("application/json", node.Content.Headers.ContentType?.MediaType);
        Assert.Equal("application/json", dotnet.Content.Headers.ContentType?.MediaType);
        using var nodeJson = JsonDocument.Parse(nodeText);
        using var dotnetJson = JsonDocument.Parse(dotnetText);
        Shape(nodeJson.RootElement, dotnetJson.RootElement, null, exactValues);
    }

    private static void Shape(JsonElement node, JsonElement dotnet, string? name, bool exactValues)
    {
        Assert.Equal(node.ValueKind, dotnet.ValueKind);
        if (!exactValues && name is "id" or "customer_id" or "expires_at" or "next_billing_date" or "cancelled_at" or "created_at" or "updated_at") return;
        if (node.ValueKind == JsonValueKind.Object)
        {
            Assert.Equal(node.EnumerateObject().Select(property => property.Name), dotnet.EnumerateObject().Select(property => property.Name));
            foreach (var property in node.EnumerateObject()) Shape(property.Value, dotnet.GetProperty(property.Name), property.Name, exactValues);
        }
        else if (node.ValueKind == JsonValueKind.Array)
        {
            Assert.Equal(node.GetArrayLength(), dotnet.GetArrayLength());
            for (var index = 0; index < node.GetArrayLength(); index++) Shape(node[index], dotnet[index], name, exactValues);
        }
        else Assert.Equal(node.GetRawText(), dotnet.GetRawText());
    }

    private static void AssertDate(JsonElement value) => Assert.Matches("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$", value.GetString()!);

    private sealed record Customer(string Token, string CustomerId, string Name, string Phone);
    private sealed record Promo(string Name, string? StoreId, string Type, decimal Value, decimal Minimum, int? MaxUses, int UsesPerCustomer, DateTimeOffset? From, DateTimeOffset? Until, bool Active, decimal Total, bool Valid, decimal Discount);
    private sealed record SubscriptionSnapshot(string Id, string Status, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt, bool AutoRenew, DateTimeOffset? CancelledAt, DateOnly? StartDate);
    private sealed record RenewCancelOutcome(string Status, bool AutoRenew, bool IsCancelled, string ExpirySource);

    private sealed class Scope : IAsyncDisposable
    {
        private readonly Net1ApiFactory factory;
        private readonly NpgsqlDataSource data;
        private Scope(Net1ApiFactory factory, HttpClient dotnet, NodeAuthServer node, NpgsqlDataSource data) { this.factory = factory; Dotnet = dotnet; Node = node; this.data = data; }
        public HttpClient Dotnet { get; }
        public NodeAuthServer Node { get; }
        public static async Task<Scope> OpenAsync()
        {
            var value = Environment.GetEnvironmentVariable("KOZ_NET2B_TEST_CONNECTION_STRING");
            if (string.IsNullOrWhiteSpace(value)) throw SkipException.ForSkip("Set KOZ_NET2B_TEST_CONNECTION_STRING.");
            Assert.Equal("koz_dotnet_net2b_test", new NpgsqlConnectionStringBuilder(value).Database);
            var factory = new Net1ApiFactory(value); var dotnet = factory.CreateClient(); var node = await NodeAuthServer.StartAsync(value, TestContext.Current.CancellationToken);
            return new Scope(factory, dotnet, node, NpgsqlDataSource.Create(value));
        }
        public async Task<Customer> RegisterAsync(string suffix)
        {
            var phone = ("n2b" + suffix + Guid.NewGuid().ToString("N"))[..32]; var name = "NET2B " + suffix;
            Assert.Equal(HttpStatusCode.OK, (await Dotnet.PostAsJsonAsync("/api/auth/otp", new { phone })).StatusCode);
            var response = await Dotnet.PostAsJsonAsync("/api/auth/register", new { phone, code = "1234", name, store_id = StoreId, privacy_policy = true, terms_of_service = true });
            Assert.Equal(HttpStatusCode.Created, response.StatusCode); using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return new(json.RootElement.GetProperty("token").GetString()!, json.RootElement.GetProperty("user").GetProperty("customer_id").GetString()!, name, phone);
        }
        public async Task<string> StaffTokenAsync(string email) { var response = await Dotnet.PostAsJsonAsync("/api/auth/staff/login", new { email, password = "Manager123" }); using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()); return json.RootElement.GetProperty("token").GetString()!; }
        public async Task<HttpResponseMessage> GetAsync(HttpClient client, string path, string? token) => await SendAsync(client, HttpMethod.Get, path, null, token);
        public async Task<HttpResponseMessage> PostAsync(HttpClient client, string path, object body, string? token) => await SendAsync(client, HttpMethod.Post, path, body, token);
        public async Task<HttpResponseMessage> SendAsync(HttpClient client, HttpMethod method, string path, object? body, string? token)
        {
            using var request = new HttpRequestMessage(method, path); if (body is not null) request.Content = JsonContent.Create(body); if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token); return await client.SendAsync(request, TestContext.Current.CancellationToken);
        }
        public async Task InsertSubscriptionAsync(string customer, string status, decimal amount = 3900m, string period = "monthly") { await using var command = data.CreateCommand("INSERT INTO subscriptions(customer_id,amount,billing_period,status,expires_at,next_billing_date,auto_renew) VALUES($1,$2,$3::billing_period,$4::subscription_status,NOW()+INTERVAL '30 days',(NOW()+INTERVAL '30 days')::date,TRUE)"); command.Parameters.AddWithValue(Guid.Parse(customer)); command.Parameters.AddWithValue(amount); command.Parameters.AddWithValue(period); command.Parameters.AddWithValue(status); await command.ExecuteNonQueryAsync(); }
        public async Task InsertDeterministicActiveSubscriptionAsync(string customer, DateTimeOffset created, DateTimeOffset expires) { await using (var subscription = data.CreateCommand("INSERT INTO subscriptions(customer_id,amount,billing_period,status,expires_at,next_billing_date,auto_renew,created_at,updated_at) VALUES($1,3900.00,'monthly','active',$2,$2::date,TRUE,$3,$3)")) { subscription.Parameters.AddWithValue(Guid.Parse(customer)); subscription.Parameters.AddWithValue(expires); subscription.Parameters.AddWithValue(created); await subscription.ExecuteNonQueryAsync(); } await using var customerState = data.CreateCommand("UPDATE customers SET subscription_status='active',subscription_start_date=$3::date,subscription_end_date=$2::date,subscription_auto_renew=TRUE,updated_at=$3 WHERE id=$1"); customerState.Parameters.AddWithValue(Guid.Parse(customer)); customerState.Parameters.AddWithValue(expires); customerState.Parameters.AddWithValue(created); await customerState.ExecuteNonQueryAsync(); }
        public async Task<SubscriptionSnapshot> SubscriptionSnapshotAsync(string customer) { await using var command = data.CreateCommand("SELECT s.id,s.status::text,s.created_at,s.expires_at,s.auto_renew,s.cancelled_at,c.subscription_start_date FROM subscriptions s JOIN customers c ON c.id=s.customer_id WHERE s.customer_id=$1 ORDER BY s.created_at DESC LIMIT 1"); command.Parameters.AddWithValue(Guid.Parse(customer)); await using var reader = await command.ExecuteReaderAsync(); Assert.True(await reader.ReadAsync()); return new(reader.GetGuid(0).ToString(), reader.GetString(1), reader.GetFieldValue<DateTimeOffset>(2), reader.GetFieldValue<DateTimeOffset>(3), reader.GetBoolean(4), reader.IsDBNull(5) ? null : reader.GetFieldValue<DateTimeOffset>(5), reader.IsDBNull(6) ? null : reader.GetFieldValue<DateOnly>(6)); }
        public async Task AssertSubscriptionAsync(string customer, string status, bool renew, bool cancelled) { await using var command = data.CreateCommand("SELECT status::text,auto_renew,cancelled_at IS NOT NULL FROM subscriptions WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 1"); command.Parameters.AddWithValue(Guid.Parse(customer)); await using var reader = await command.ExecuteReaderAsync(); Assert.True(await reader.ReadAsync()); Assert.Equal(status, reader.GetString(0)); Assert.Equal(renew, reader.GetBoolean(1)); Assert.Equal(cancelled, reader.GetBoolean(2)); }
        public async Task<string> CreateStoreAsync() { var id = Guid.NewGuid(); await using var command = data.CreateCommand("INSERT INTO stores(id,name,address) VALUES($1,'NET2B','NET2B')"); command.Parameters.AddWithValue(id); await command.ExecuteNonQueryAsync(); return id.ToString(); }
        public async Task<string> InsertPromoAsync(string code, Promo promo) { await using var command = data.CreateCommand("INSERT INTO promo_codes(store_id,code,discount_type,discount_value,min_order_value,max_uses,usage_per_customer,valid_from,valid_until,is_active) VALUES($1,$2,$3::discount_type,$4,$5,$6,$7,$8,$9,$10) RETURNING id"); command.Parameters.AddWithValue(promo.StoreId is null ? DBNull.Value : Guid.Parse(promo.StoreId)); command.Parameters.AddWithValue(code); command.Parameters.AddWithValue(promo.Type); command.Parameters.AddWithValue(promo.Value); command.Parameters.AddWithValue(promo.Minimum); command.Parameters.AddWithValue(promo.MaxUses is null ? DBNull.Value : promo.MaxUses.Value); command.Parameters.AddWithValue(promo.UsesPerCustomer); command.Parameters.AddWithValue(promo.From is null ? DBNull.Value : promo.From.Value); command.Parameters.AddWithValue(promo.Until is null ? DBNull.Value : promo.Until.Value); command.Parameters.AddWithValue(promo.Active); return ((Guid)(await command.ExecuteScalarAsync())!).ToString(); }
        public async Task<string> PromoCodeAsync(string id) { await using var command = data.CreateCommand("SELECT code FROM promo_codes WHERE id=$1"); command.Parameters.AddWithValue(Guid.Parse(id)); return (string)(await command.ExecuteScalarAsync())!; }
        public async Task InsertPromoUseAsync(string promo, string customer) { await using var command = data.CreateCommand("INSERT INTO promo_code_usage(promo_code_id,customer_id,discount_amount) VALUES($1,$2,0)"); command.Parameters.AddWithValue(Guid.Parse(promo)); command.Parameters.AddWithValue(Guid.Parse(customer)); await command.ExecuteNonQueryAsync(); }
        public async Task<int> PromoUseCountAsync(string promo) => await CountAsync("SELECT COUNT(*)::int FROM promo_code_usage WHERE promo_code_id=$1", promo);
        public async Task<int> SubscriptionCountAsync(string customer) => await CountAsync("SELECT COUNT(*)::int FROM subscriptions WHERE customer_id=$1", customer);
        public async Task<int> ActiveSubscriptionCountAsync(string customer) => await CountAsync("SELECT COUNT(*)::int FROM subscriptions WHERE customer_id=$1 AND status='active'", customer);
        public async Task<int> PaymentCountAsync() => await CountAsync("SELECT COUNT(*)::int FROM payments");
        public async Task<int> OrphanSubscriptionCountAsync() => await CountAsync("SELECT COUNT(*)::int FROM subscriptions s LEFT JOIN customers c ON c.id=s.customer_id WHERE c.id IS NULL");
        private async Task<int> CountAsync(string sql, string? id = null) { await using var command = data.CreateCommand(sql); if (id is not null) command.Parameters.AddWithValue(Guid.Parse(id)); return Convert.ToInt32(await command.ExecuteScalarAsync()); }
        public string ExpiredToken() { var handler = new JwtSecurityTokenHandler(); return handler.WriteToken(new JwtSecurityToken(claims: [new("id", Guid.NewGuid().ToString()), new("role", "customer")], expires: DateTime.UtcNow.AddMinutes(-1), signingCredentials: new Microsoft.IdentityModel.Tokens.SigningCredentials(new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes("net1-testing-jwt-secret-with-at-least-32-characters")), Microsoft.IdentityModel.Tokens.SecurityAlgorithms.HmacSha256))); }
        public async ValueTask DisposeAsync() { data.Dispose(); Node.Dispose(); Dotnet.Dispose(); factory.Dispose(); await Task.CompletedTask; }
    }
}
