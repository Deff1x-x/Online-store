using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Npgsql;
using Xunit;
using Xunit.Sdk;

namespace Koz.IntegrationTests;

[Collection("NodeApi")]
public sealed class Net3aOrderCreateIntegrationTests
{
    private const string StoreId = "11111111-1111-1111-1111-111111111111";
    private const string CoverageId = "22222222-2222-2222-2222-222222222222";
    private const string TomatoesId = "33333333-3333-3333-3333-333333333333";
    private const string MilkId = "55555555-5555-5555-5555-555555555555";
    private const string OrderProductId = "77777777-7777-7777-7777-777777777777";

    [Fact, Trait("Category", "Integration")]
    public async Task OrderCreateHappyPathParity_A12_constants_and_side_effects()
    {
        await using var scope = await Scope.OpenAsync();
        var nodeCustomer = await scope.RegisterAsync("node-a12");
        var dotnetCustomer = await scope.RegisterAsync("dotnet-a12");
        var nodeAddress = await scope.ActivateOrderCustomerAsync(nodeCustomer.CustomerId);
        var dotnetAddress = await scope.ActivateOrderCustomerAsync(dotnetCustomer.CustomerId);
        var node = await scope.PostAsync(scope.Node.Client, new { payment_method = "online", delivery_address_id = nodeAddress, items = new[] { new { product_id = TomatoesId, quantity = 1.5m }, new { product_id = MilkId, quantity = 2m } } }, nodeCustomer.Token);
        var dotnet = await scope.PostAsync(scope.Dotnet, new { payment_method = "online", delivery_address_id = dotnetAddress, items = new[] { new { product_id = TomatoesId, quantity = 1.5m }, new { product_id = MilkId, quantity = 2m } } }, dotnetCustomer.Token);

        Assert.Equal(HttpStatusCode.Created, node.StatusCode);
        Assert.Equal(HttpStatusCode.Created, dotnet.StatusCode);
        Assert.Equal("application/json; charset=utf-8", node.Content.Headers.ContentType!.ToString());
        Assert.Equal(node.Content.Headers.ContentType!.ToString(), dotnet.Content.Headers.ContentType!.ToString());
        using var nodeJson = JsonDocument.Parse(await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        using var dotnetJson = JsonDocument.Parse(await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal(new[] { "order_id", "order_number", "breakdown", "payment_options", "order" }, nodeJson.RootElement.EnumerateObject().Select(p => p.Name));
        Assert.Equal(nodeJson.RootElement.EnumerateObject().Select(p => p.Name), dotnetJson.RootElement.EnumerateObject().Select(p => p.Name));
        AssertA12(nodeJson.RootElement);
        AssertA12(dotnetJson.RootElement);
        Assert.Equal(nodeJson.RootElement.GetProperty("breakdown").GetRawText(), dotnetJson.RootElement.GetProperty("breakdown").GetRawText());
        Assert.Equal(nodeJson.RootElement.GetProperty("payment_options").GetRawText(), dotnetJson.RootElement.GetProperty("payment_options").GetRawText());
        Assert.Equal(nodeJson.RootElement.GetProperty("order").EnumerateObject().Select(p => p.Name), dotnetJson.RootElement.GetProperty("order").EnumerateObject().Select(p => p.Name));
        foreach (var field in new[] { "fulfillment_window", "delivery_date", "delivery_time_slot", "delivery_status", "payment_status" })
        {
            Assert.Equal(nodeJson.RootElement.GetProperty("order").GetProperty(field).GetRawText(), dotnetJson.RootElement.GetProperty("order").GetProperty(field).GetRawText());
        }
        await scope.AssertSideEffectsAsync(nodeCustomer.CustomerId, nodeAddress, 47m);
        await scope.AssertSideEffectsAsync(dotnetCustomer.CustomerId, dotnetAddress, 47m);
    }

    [Fact, Trait("Category", "Integration")]
    public async Task OrderCreatePromoParity_fixed_and_discount_cap_have_exact_money_and_usage()
    {
        await using var scope = await Scope.OpenAsync();
        await scope.UpsertOrderProductAsync();
        var nodeCustomer = await scope.RegisterAsync("node-promo");
        var dotnetCustomer = await scope.RegisterAsync("dotnet-promo");
        var nodeAddress = await scope.ActivateOrderCustomerAsync(nodeCustomer.CustomerId);
        var dotnetAddress = await scope.ActivateOrderCustomerAsync(dotnetCustomer.CustomerId);
        var fixedCode = await scope.InsertPromoAsync(1500m);
        var node = await scope.PostAsync(scope.Node.Client, new { payment_method = "online", delivery_address_id = nodeAddress, items = new[] { new { product_id = OrderProductId, quantity = 1m } }, promo_code = fixedCode.ToLowerInvariant() }, nodeCustomer.Token);
        var dotnet = await scope.PostAsync(scope.Dotnet, new { payment_method = "online", delivery_address_id = dotnetAddress, items = new[] { new { product_id = OrderProductId, quantity = 1m } }, promo_code = fixedCode.ToLowerInvariant() }, dotnetCustomer.Token);
        await AssertSameSuccessAsync(node, dotnet, new[] { ("discount_total", "1500"), ("delivery_fee", "500"), ("final_total", "2025"), ("preauth_amount", "1620"), ("remainder_on_delivery", "405") });
        await scope.AssertPromoUsageAsync(nodeCustomer.CustomerId, 1500m);
        await scope.AssertPromoUsageAsync(dotnetCustomer.CustomerId, 1500m);

        var capNode = await scope.RegisterAsync("node-cap");
        var capDotnet = await scope.RegisterAsync("dotnet-cap");
        var capNodeAddress = await scope.ActivateOrderCustomerAsync(capNode.CustomerId);
        var capDotnetAddress = await scope.ActivateOrderCustomerAsync(capDotnet.CustomerId);
        var capCode = await scope.InsertPromoAsync(5000m);
        node = await scope.PostAsync(scope.Node.Client, new { payment_method = "online", delivery_address_id = capNodeAddress, items = new[] { new { product_id = OrderProductId, quantity = 1m } }, promo_code = capCode }, capNode.Token);
        dotnet = await scope.PostAsync(scope.Dotnet, new { payment_method = "online", delivery_address_id = capDotnetAddress, items = new[] { new { product_id = OrderProductId, quantity = 1m } }, promo_code = capCode }, capDotnet.Token);
        await AssertSameSuccessAsync(node, dotnet, new[] { ("discount_total", "3025"), ("delivery_fee", "500"), ("final_total", "500"), ("preauth_amount", "400"), ("remainder_on_delivery", "100") });
        await scope.AssertPromoUsageAsync(capNode.CustomerId, 3025m);
        await scope.AssertPromoUsageAsync(capDotnet.CustomerId, 3025m);
    }

    [Fact, Trait("Category", "Integration")]
    public async Task OrderCreateFirstOrderDiscount_wins_ties_and_does_not_write_promo_usage()
    {
        await using var scope = await Scope.OpenAsync();
        var nodeCustomer = await scope.RegisterAsync("node-first");
        var dotnetCustomer = await scope.RegisterAsync("dotnet-first");
        var nodeAddress = await scope.ActivateOrderCustomerAsync(nodeCustomer.CustomerId, disableFirstDiscount: false);
        var dotnetAddress = await scope.ActivateOrderCustomerAsync(dotnetCustomer.CustomerId, disableFirstDiscount: false);
        var promo = await scope.InsertPromoAsync(1500m);
        var bodyNode = new { payment_method = "online", delivery_address_id = nodeAddress, items = new[] { new { product_id = TomatoesId, quantity = 1.5m }, new { product_id = MilkId, quantity = 2m } }, promo_code = promo };
        var bodyDotnet = new { payment_method = "online", delivery_address_id = dotnetAddress, items = new[] { new { product_id = TomatoesId, quantity = 1.5m }, new { product_id = MilkId, quantity = 2m } }, promo_code = promo };
        var node = await scope.PostAsync(scope.Node.Client, bodyNode, nodeCustomer.Token);
        var dotnet = await scope.PostAsync(scope.Dotnet, bodyDotnet, dotnetCustomer.Token);
        await AssertSameSuccessAsync(node, dotnet, new[] { ("first_order_discount", "1563"), ("promo_discount", "0"), ("discount_total", "1563"), ("final_total", "500") });
        await scope.AssertFirstDiscountAsync(nodeCustomer.CustomerId, true);
        await scope.AssertFirstDiscountAsync(dotnetCustomer.CustomerId, true);
        await scope.AssertPromoUsageAsync(nodeCustomer.CustomerId, null);
        await scope.AssertPromoUsageAsync(dotnetCustomer.CustomerId, null);
    }

    [Fact, Trait("Category", "Integration")]
    public async Task OrderCreateConcurrency_last_stock_is_parallel_and_matches_Node_for_five_resets()
    {
        for (var run = 0; run < 5; run++)
        {
            await using var scope = await Scope.OpenAsync();
            await scope.SetInventoryQuantityAsync(TomatoesId, 1m, 1);
            var nodeFirst = await scope.RegisterAsync("node-race-a-" + run);
            var nodeSecond = await scope.RegisterAsync("node-race-b-" + run);
            var nodeFirstAddress = await scope.ActivateOrderCustomerAsync(nodeFirst.CustomerId);
            var nodeSecondAddress = await scope.ActivateOrderCustomerAsync(nodeSecond.CustomerId);
            var nodeResponses = await ConcurrentAsync(
                () => scope.PostAsync(scope.Node.Client, new { payment_method = "online", delivery_address_id = nodeFirstAddress, items = new[] { new { product_id = TomatoesId, quantity = 1m } } }, nodeFirst.Token),
                () => scope.PostAsync(scope.Node.Client, new { payment_method = "online", delivery_address_id = nodeSecondAddress, items = new[] { new { product_id = TomatoesId, quantity = 1m } } }, nodeSecond.Token));
            Assert.Equal(new[] { HttpStatusCode.Created, HttpStatusCode.Conflict }, nodeResponses.Select(response => response.StatusCode).Order());
            await scope.AssertErrorParityAsync(nodeResponses.Single(response => response.StatusCode == HttpStatusCode.Conflict));
            Assert.Equal(0m, await scope.InventoryQuantityAsync(TomatoesId));
            Assert.Equal(1, await scope.OrderCountAsync(nodeFirst.CustomerId, nodeSecond.CustomerId));

            await scope.SetInventoryQuantityAsync(TomatoesId, 1m, 1);
            var dotnetFirst = await scope.RegisterAsync("dotnet-race-a-" + run);
            var dotnetSecond = await scope.RegisterAsync("dotnet-race-b-" + run);
            var dotnetFirstAddress = await scope.ActivateOrderCustomerAsync(dotnetFirst.CustomerId);
            var dotnetSecondAddress = await scope.ActivateOrderCustomerAsync(dotnetSecond.CustomerId);
            var dotnetResponses = await ConcurrentAsync(
                () => scope.PostAsync(scope.Dotnet, new { payment_method = "online", delivery_address_id = dotnetFirstAddress, items = new[] { new { product_id = TomatoesId, quantity = 1m } } }, dotnetFirst.Token),
                () => scope.PostAsync(scope.Dotnet, new { payment_method = "online", delivery_address_id = dotnetSecondAddress, items = new[] { new { product_id = TomatoesId, quantity = 1m } } }, dotnetSecond.Token));
            Assert.Equal(nodeResponses.Select(response => response.StatusCode).Order(), dotnetResponses.Select(response => response.StatusCode).Order());
            var nodeFailure = nodeResponses.Single(response => response.StatusCode == HttpStatusCode.Conflict);
            var dotnetFailure = dotnetResponses.Single(response => response.StatusCode == HttpStatusCode.Conflict);
            Assert.Equal(await nodeFailure.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), await dotnetFailure.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
            Assert.Equal(0m, await scope.InventoryQuantityAsync(TomatoesId));
            Assert.Equal(1, await scope.OrderCountAsync(dotnetFirst.CustomerId, dotnetSecond.CustomerId));
            Assert.Equal(0, await scope.OrphanOrderCountAsync());
        }
    }

    [Fact, Trait("Category", "Integration")]
    public async Task OrderCreateValidationAndRollback_match_Node_without_partial_stock_reservation()
    {
        await using var scope = await Scope.OpenAsync();
        var node = await scope.RegisterAsync("node-errors");
        var dotnet = await scope.RegisterAsync("dotnet-errors");
        var nodeAddress = await scope.ActivateOrderCustomerAsync(node.CustomerId);
        var dotnetAddress = await scope.ActivateOrderCustomerAsync(dotnet.CustomerId);
        await AssertSameErrorAsync(
            await scope.PostAsync(scope.Node.Client, new { payment_method = "pos", delivery_address_id = nodeAddress, items = new[] { new { product_id = TomatoesId, quantity = 1m } } }, node.Token),
            await scope.PostAsync(scope.Dotnet, new { payment_method = "pos", delivery_address_id = dotnetAddress, items = new[] { new { product_id = TomatoesId, quantity = 1m } } }, dotnet.Token), HttpStatusCode.BadRequest);
        await AssertSameErrorAsync(
            await scope.PostAsync(scope.Node.Client, new { payment_method = "online", delivery_address_id = nodeAddress, items = Array.Empty<object>() }, node.Token),
            await scope.PostAsync(scope.Dotnet, new { payment_method = "online", delivery_address_id = dotnetAddress, items = Array.Empty<object>() }, dotnet.Token), HttpStatusCode.BadRequest);
        await AssertSameErrorAsync(
            await scope.PostAsync(scope.Node.Client, new { payment_method = "online", delivery_address_id = nodeAddress, items = new[] { new { product_id = MilkId, quantity = 1.5m } } }, node.Token),
            await scope.PostAsync(scope.Dotnet, new { payment_method = "online", delivery_address_id = dotnetAddress, items = new[] { new { product_id = MilkId, quantity = 1.5m } } }, dotnet.Token), HttpStatusCode.BadRequest);
        await AssertSameErrorAsync(
            await scope.PostAsync(scope.Node.Client, new { payment_method = "online", delivery_address_id = nodeAddress, items = new[] { new { product_id = TomatoesId, quantity = 1.23m } } }, node.Token),
            await scope.PostAsync(scope.Dotnet, new { payment_method = "online", delivery_address_id = dotnetAddress, items = new[] { new { product_id = TomatoesId, quantity = 1.23m } } }, dotnet.Token), HttpStatusCode.BadRequest);

        await scope.SetInventoryQuantityAsync(MilkId, 0m, 0);
        await AssertSameErrorAsync(
            await scope.PostAsync(scope.Node.Client, new { payment_method = "online", delivery_address_id = nodeAddress, items = new[] { new { product_id = TomatoesId, quantity = 1m }, new { product_id = MilkId, quantity = 1m } } }, node.Token),
            await scope.PostAsync(scope.Dotnet, new { payment_method = "online", delivery_address_id = dotnetAddress, items = new[] { new { product_id = TomatoesId, quantity = 1m }, new { product_id = MilkId, quantity = 1m } } }, dotnet.Token), HttpStatusCode.Conflict);
        Assert.Equal(50m, await scope.InventoryQuantityAsync(TomatoesId));
        Assert.Equal(0, await scope.OrderCountAsync(node.CustomerId, dotnet.CustomerId));
        Assert.Equal(0, await scope.PromoUsageCountAsync(node.CustomerId, dotnet.CustomerId));
        Assert.Equal(0, await scope.PaymentCountAsync(node.CustomerId, dotnet.CustomerId));
    }

    [Fact, Trait("Category", "Integration")]
    public async Task OrderCreateAuthorization_and_address_IDOR_match_Node()
    {
        await using var scope = await Scope.OpenAsync();
        var body = new { payment_method = "online", delivery_address_id = Guid.NewGuid().ToString(), items = new[] { new { product_id = TomatoesId, quantity = 1m } } };
        foreach (var email in new[] { "manager@koz.kz", "catalog@koz.kz", "admin@koz.kz", "customers@koz.kz" })
        {
            var token = await scope.StaffTokenAsync(email);
            await AssertSameErrorAsync(await scope.PostAsync(scope.Node.Client, body, token), await scope.PostAsync(scope.Dotnet, body, token), HttpStatusCode.Forbidden);
        }
        await AssertSameErrorAsync(await scope.PostAsync(scope.Node.Client, body, null), await scope.PostAsync(scope.Dotnet, body, null), HttpStatusCode.Unauthorized);
        await AssertSameErrorAsync(await scope.PostAsync(scope.Node.Client, body, "not-a-jwt"), await scope.PostAsync(scope.Dotnet, body, "not-a-jwt"), HttpStatusCode.Forbidden);

        var nodeOwner = await scope.RegisterAsync("node-idor-owner");
        var nodeOther = await scope.RegisterAsync("node-idor-other");
        var dotnetOwner = await scope.RegisterAsync("dotnet-idor-owner");
        var dotnetOther = await scope.RegisterAsync("dotnet-idor-other");
        await scope.ActivateOrderCustomerAsync(nodeOwner.CustomerId);
        var nodeForeignAddress = await scope.ActivateOrderCustomerAsync(nodeOther.CustomerId);
        await scope.ActivateOrderCustomerAsync(dotnetOwner.CustomerId);
        var dotnetForeignAddress = await scope.ActivateOrderCustomerAsync(dotnetOther.CustomerId);
        await AssertSameErrorAsync(
            await scope.PostAsync(scope.Node.Client, new { payment_method = "online", delivery_address_id = nodeForeignAddress, items = new[] { new { product_id = TomatoesId, quantity = 1m } } }, nodeOwner.Token),
            await scope.PostAsync(scope.Dotnet, new { payment_method = "online", delivery_address_id = dotnetForeignAddress, items = new[] { new { product_id = TomatoesId, quantity = 1m } } }, dotnetOwner.Token), HttpStatusCode.NotFound);
    }

    [Fact, Trait("Category", "Integration")]
    public async Task OrderCreateMalformedJson_matches_Node_error_contract()
    {
        await using var scope = await Scope.OpenAsync();
        var customer = await scope.RegisterAsync("malformed-json");
        var node = await scope.PostRawAsync(scope.Node.Client, "{", customer.Token);
        var dotnet = await scope.PostRawAsync(scope.Dotnet, "{", customer.Token);
        Assert.Equal(node.StatusCode, dotnet.StatusCode);
        Assert.Equal(node.Content.Headers.ContentType!.ToString(), dotnet.Content.Headers.ContentType!.ToString());
        Assert.Equal(await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }

    [Fact, Trait("Category", "Integration")]
    public async Task OrderCreateConcurrency_duplicate_customer_requests_match_Node_for_five_resets()
    {
        for (var run = 0; run < 5; run++)
        {
            await using var scope = await Scope.OpenAsync();
            var nodeCustomer = await scope.RegisterAsync("node-duplicate-" + run);
            var dotnetCustomer = await scope.RegisterAsync("dotnet-duplicate-" + run);
            var nodeAddress = await scope.ActivateOrderCustomerAsync(nodeCustomer.CustomerId);
            var dotnetAddress = await scope.ActivateOrderCustomerAsync(dotnetCustomer.CustomerId);
            var node = await ConcurrentAsync(
                () => scope.PostAsync(scope.Node.Client, OrderBody(nodeAddress), nodeCustomer.Token),
                () => scope.PostAsync(scope.Node.Client, OrderBody(nodeAddress), nodeCustomer.Token));
            var dotnet = await ConcurrentAsync(
                () => scope.PostAsync(scope.Dotnet, OrderBody(dotnetAddress), dotnetCustomer.Token),
                () => scope.PostAsync(scope.Dotnet, OrderBody(dotnetAddress), dotnetCustomer.Token));
            Assert.Equal(node.Select(x => x.StatusCode).Order(), dotnet.Select(x => x.StatusCode).Order());
            Assert.Equal(2, await scope.OrderCountAsync(nodeCustomer.CustomerId));
            Assert.Equal(2, await scope.OrderCountAsync(dotnetCustomer.CustomerId));
            Assert.Equal(0, await scope.PaymentCountAsync(nodeCustomer.CustomerId, dotnetCustomer.CustomerId));
            Assert.Equal(0, await scope.OrphanOrderCountAsync());
        }
    }

    [Fact, Trait("Category", "Integration")]
    public async Task OrderCreateConcurrency_global_and_per_customer_promo_limits_match_Node_for_five_resets()
    {
        for (var run = 0; run < 5; run++)
        {
            await using var scope = await Scope.OpenAsync();
            await scope.UpsertOrderProductAsync();
            var nodeFirst = await scope.RegisterAsync("node-global-a-" + run);
            var nodeSecond = await scope.RegisterAsync("node-global-b-" + run);
            var dotnetFirst = await scope.RegisterAsync("dotnet-global-a-" + run);
            var dotnetSecond = await scope.RegisterAsync("dotnet-global-b-" + run);
            var nodeA = await scope.ActivateOrderCustomerAsync(nodeFirst.CustomerId); var nodeB = await scope.ActivateOrderCustomerAsync(nodeSecond.CustomerId);
            var dotnetA = await scope.ActivateOrderCustomerAsync(dotnetFirst.CustomerId); var dotnetB = await scope.ActivateOrderCustomerAsync(dotnetSecond.CustomerId);
            var nodeCode = await scope.InsertPromoAsync(1500m, maxUses: 1, usagePerCustomer: 5);
            var dotnetCode = await scope.InsertPromoAsync(1500m, maxUses: 1, usagePerCustomer: 5);
            var node = await ConcurrentAsync(
                () => scope.PostAsync(scope.Node.Client, OrderBody(nodeA, nodeCode), nodeFirst.Token),
                () => scope.PostAsync(scope.Node.Client, OrderBody(nodeB, nodeCode), nodeSecond.Token));
            var dotnet = await ConcurrentAsync(
                () => scope.PostAsync(scope.Dotnet, OrderBody(dotnetA, dotnetCode), dotnetFirst.Token),
                () => scope.PostAsync(scope.Dotnet, OrderBody(dotnetB, dotnetCode), dotnetSecond.Token));
            Assert.Equal(node.Select(x => x.StatusCode).Order(), dotnet.Select(x => x.StatusCode).Order());
            Assert.Equal(1, node.Count(x => x.StatusCode == HttpStatusCode.Created));
            Assert.Equal(1, dotnet.Count(x => x.StatusCode == HttpStatusCode.Created));

            var nodePer = await scope.RegisterAsync("node-per-" + run); var dotnetPer = await scope.RegisterAsync("dotnet-per-" + run);
            var nodePerAddress = await scope.ActivateOrderCustomerAsync(nodePer.CustomerId); var dotnetPerAddress = await scope.ActivateOrderCustomerAsync(dotnetPer.CustomerId);
            nodeCode = await scope.InsertPromoAsync(1500m, usagePerCustomer: 1); dotnetCode = await scope.InsertPromoAsync(1500m, usagePerCustomer: 1);
            node = await ConcurrentAsync(
                () => scope.PostAsync(scope.Node.Client, OrderBody(nodePerAddress, nodeCode), nodePer.Token),
                () => scope.PostAsync(scope.Node.Client, OrderBody(nodePerAddress, nodeCode), nodePer.Token));
            dotnet = await ConcurrentAsync(
                () => scope.PostAsync(scope.Dotnet, OrderBody(dotnetPerAddress, dotnetCode), dotnetPer.Token),
                () => scope.PostAsync(scope.Dotnet, OrderBody(dotnetPerAddress, dotnetCode), dotnetPer.Token));
            Assert.Equal(node.Select(x => x.StatusCode).Order(), dotnet.Select(x => x.StatusCode).Order());
            Assert.Equal(1, node.Count(x => x.StatusCode == HttpStatusCode.Created));
            Assert.Equal(1, dotnet.Count(x => x.StatusCode == HttpStatusCode.Created));
            Assert.Equal(0, await scope.OrphanOrderCountAsync());
        }
    }

    [Fact, Trait("Category", "Integration")]
    public async Task OrderCreateConcurrency_first_order_discount_is_used_once_and_matches_Node_for_five_resets()
    {
        for (var run = 0; run < 5; run++)
        {
            await using var scope = await Scope.OpenAsync();
            var nodeCustomer = await scope.RegisterAsync("node-first-race-" + run);
            var dotnetCustomer = await scope.RegisterAsync("dotnet-first-race-" + run);
            var nodeAddress = await scope.ActivateOrderCustomerAsync(nodeCustomer.CustomerId, disableFirstDiscount: false);
            var dotnetAddress = await scope.ActivateOrderCustomerAsync(dotnetCustomer.CustomerId, disableFirstDiscount: false);
            var node = await ConcurrentAsync(
                () => scope.PostAsync(scope.Node.Client, OrderBody(nodeAddress), nodeCustomer.Token),
                () => scope.PostAsync(scope.Node.Client, OrderBody(nodeAddress), nodeCustomer.Token));
            var dotnet = await ConcurrentAsync(
                () => scope.PostAsync(scope.Dotnet, OrderBody(dotnetAddress), dotnetCustomer.Token),
                () => scope.PostAsync(scope.Dotnet, OrderBody(dotnetAddress), dotnetCustomer.Token));
            Assert.Equal(node.Select(x => x.StatusCode).Order(), dotnet.Select(x => x.StatusCode).Order());
            Assert.All(node, x => Assert.Equal(HttpStatusCode.Created, x.StatusCode));
            Assert.All(dotnet, x => Assert.Equal(HttpStatusCode.Created, x.StatusCode));
            Assert.Equal(await DiscountsAsync(node), await DiscountsAsync(dotnet));
            await scope.AssertFirstDiscountAsync(nodeCustomer.CustomerId, true);
            await scope.AssertFirstDiscountAsync(dotnetCustomer.CustomerId, true);
            Assert.Equal(2, await scope.OrderCountAsync(nodeCustomer.CustomerId));
            Assert.Equal(2, await scope.OrderCountAsync(dotnetCustomer.CustomerId));
        }
    }

    private static object OrderBody(string address, string? promoCode = null) => new { payment_method = "online", delivery_address_id = address, items = new[] { new { product_id = TomatoesId, quantity = 1m } }, promo_code = promoCode };
    private static async Task<IReadOnlyList<string>> DiscountsAsync(IEnumerable<HttpResponseMessage> responses)
    {
        var values = new List<string>();
        foreach (var response in responses)
        {
            using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
            values.Add(body.RootElement.GetProperty("breakdown").GetProperty("first_order_discount").GetRawText());
        }
        return values.Order().ToArray();
    }

    private static async Task AssertSameErrorAsync(HttpResponseMessage node, HttpResponseMessage dotnet, HttpStatusCode status)
    {
        Assert.Equal(status, node.StatusCode); Assert.Equal(node.StatusCode, dotnet.StatusCode);
        Assert.Equal("application/json; charset=utf-8", node.Content.Headers.ContentType!.ToString());
        Assert.Equal(node.Content.Headers.ContentType!.ToString(), dotnet.Content.Headers.ContentType!.ToString());
        Assert.Equal(await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }

    private static async Task<HttpResponseMessage[]> ConcurrentAsync(Func<Task<HttpResponseMessage>> first, Func<Task<HttpResponseMessage>> second)
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var ready = new CountdownEvent(2);
        async Task<HttpResponseMessage> StartAsync(Func<Task<HttpResponseMessage>> action)
        {
            ready.Signal();
            await release.Task;
            return await action();
        }
        var tasks = new[] { StartAsync(first), StartAsync(second) };
        Assert.True(ready.Wait(TimeSpan.FromSeconds(2)));
        release.SetResult();
        return await Task.WhenAll(tasks);
    }

    private static async Task AssertSameSuccessAsync(HttpResponseMessage node, HttpResponseMessage dotnet, IReadOnlyList<(string Key, string Expected)> expected)
    {
        Assert.Equal(HttpStatusCode.Created, node.StatusCode);
        Assert.Equal(node.StatusCode, dotnet.StatusCode);
        using var nodeJson = JsonDocument.Parse(await node.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        using var dotnetJson = JsonDocument.Parse(await dotnet.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal(nodeJson.RootElement.GetProperty("breakdown").GetRawText(), dotnetJson.RootElement.GetProperty("breakdown").GetRawText());
        Assert.Equal(nodeJson.RootElement.GetProperty("payment_options").GetRawText(), dotnetJson.RootElement.GetProperty("payment_options").GetRawText());
        foreach (var (key, value) in expected)
        {
            var nodeValue = key is "preauth_amount" or "remainder_on_delivery" ? nodeJson.RootElement.GetProperty("payment_options").GetProperty("online").GetProperty(key) : nodeJson.RootElement.GetProperty("breakdown").GetProperty(key);
            Assert.Equal(value, nodeValue.GetRawText());
        }
    }

    private static void AssertA12(JsonElement root)
    {
        var breakdown = root.GetProperty("breakdown");
        Assert.Equal("1563", breakdown.GetProperty("subtotal").GetRawText());
        Assert.Equal("500", breakdown.GetProperty("delivery_fee").GetRawText());
        Assert.Equal("2063", breakdown.GetProperty("final_total").GetRawText());
        var online = root.GetProperty("payment_options").GetProperty("online");
        Assert.Equal("1650.4", online.GetProperty("preauth_amount").GetRawText());
        Assert.Equal("412.6", online.GetProperty("remainder_on_delivery").GetRawText());
        Assert.Equal(JsonValueKind.String, root.GetProperty("order").GetProperty("subtotal").ValueKind);
        Assert.Equal(JsonValueKind.String, root.GetProperty("order").GetProperty("items")[0].GetProperty("quantity").ValueKind);
    }

    private sealed record Customer(string Token, string CustomerId);

    private sealed class Scope : IAsyncDisposable
    {
        private readonly Net1ApiFactory factory;
        private readonly NpgsqlDataSource data;
        private Scope(Net1ApiFactory factory, HttpClient dotnet, NodeAuthServer node, NpgsqlDataSource data) { this.factory = factory; Dotnet = dotnet; Node = node; this.data = data; }
        public HttpClient Dotnet { get; }
        public NodeAuthServer Node { get; }
        public static async Task<Scope> OpenAsync()
        {
            var value = Environment.GetEnvironmentVariable("KOZ_NET3A_TEST_CONNECTION_STRING");
            if (string.IsNullOrWhiteSpace(value)) throw SkipException.ForSkip("Set KOZ_NET3A_TEST_CONNECTION_STRING.");
            Assert.Equal("koz_dotnet_net3a_test", new NpgsqlConnectionStringBuilder(value).Database);
            await ResetAsync(value);
            var factory = new Net1ApiFactory(value); var dotnet = factory.CreateClient(); var node = await NodeAuthServer.StartAsync(value, TestContext.Current.CancellationToken);
            return new Scope(factory, dotnet, node, NpgsqlDataSource.Create(value));
        }
        public async Task<Customer> RegisterAsync(string suffix)
        {
            var phone = ("n3a" + suffix + Guid.NewGuid().ToString("N"))[..32];
            Assert.Equal(HttpStatusCode.OK, (await Dotnet.PostAsJsonAsync("/api/auth/otp", new { phone })).StatusCode);
            var response = await Dotnet.PostAsJsonAsync("/api/auth/register", new { phone, code = "1234", name = "NET3A", store_id = StoreId, privacy_policy = true, terms_of_service = true });
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return new(json.RootElement.GetProperty("token").GetString()!, json.RootElement.GetProperty("user").GetProperty("customer_id").GetString()!);
        }
        public async Task<string> ActivateOrderCustomerAsync(string customerId, bool disableFirstDiscount = true)
        {
            var addressId = Guid.NewGuid();
            var customer = Guid.Parse(customerId);
            await ExecuteAsync("UPDATE customers SET subscription_status='active',subscription_start_date=CURRENT_DATE,subscription_end_date=CURRENT_DATE+30,subscription_auto_renew=TRUE WHERE id=$1", customer);
            await ExecuteAsync("INSERT INTO subscriptions(customer_id,amount,billing_period,status,expires_at,next_billing_date,auto_renew) VALUES($1,3900,'monthly','active',NOW()+INTERVAL '30 days',(NOW()+INTERVAL '30 days')::date,TRUE)", customer);
            if (disableFirstDiscount) await ExecuteAsync("UPDATE first_order_discounts SET is_used=TRUE WHERE customer_id=$1", customer);
            await ExecuteAsync("INSERT INTO customer_addresses(id,customer_id,store_coverage_id,is_default) VALUES($1,$2,$3,TRUE)", addressId, customer, Guid.Parse(CoverageId));
            return addressId.ToString();
        }
        public async Task<string> StaffTokenAsync(string email)
        {
            var response = await Dotnet.PostAsJsonAsync("/api/auth/staff/login", new { email, password = "Manager123" }, TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
            return json.RootElement.GetProperty("token").GetString()!;
        }
        public async Task<HttpResponseMessage> PostAsync(HttpClient client, object body, string? token)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/orders") { Content = JsonContent.Create(body) };
            if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return await client.SendAsync(request, TestContext.Current.CancellationToken);
        }
        public async Task<HttpResponseMessage> PostRawAsync(HttpClient client, string body, string token)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/orders") { Content = new StringContent(body, Encoding.UTF8, "application/json") };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return await client.SendAsync(request, TestContext.Current.CancellationToken);
        }
        public async Task AssertSideEffectsAsync(string customerId, string addressId, decimal tomatoQuantity)
        {
            await using var command = data.CreateCommand("SELECT (SELECT COUNT(*) FROM orders WHERE customer_id=$1), (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.customer_id=$1), (SELECT quantity FROM store_inventory WHERE store_id=$2 AND product_id=$3), (SELECT COUNT(*) FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.customer_id=$1), (SELECT COUNT(*) FROM promo_code_usage u JOIN orders o ON o.id=u.order_id WHERE o.customer_id=$1), (SELECT COUNT(*) FROM orders o LEFT JOIN customer_addresses a ON a.id=o.delivery_address_id WHERE o.customer_id=$1 AND a.id IS NULL)");
            command.Parameters.AddWithValue(Guid.Parse(customerId)); command.Parameters.AddWithValue(Guid.Parse(StoreId)); command.Parameters.AddWithValue(Guid.Parse(TomatoesId));
            await using var reader = await command.ExecuteReaderAsync(); Assert.True(await reader.ReadAsync());
            Assert.Equal(1L, reader.GetInt64(0)); Assert.Equal(2L, reader.GetInt64(1)); Assert.Equal(tomatoQuantity, reader.GetDecimal(2)); Assert.Equal(0L, reader.GetInt64(3)); Assert.Equal(0L, reader.GetInt64(4)); Assert.Equal(0L, reader.GetInt64(5));
        }
        public async Task UpsertOrderProductAsync()
        {
            await ExecuteAsync("INSERT INTO products(id,name,category,unit,price_per_unit,company_price,is_weighted,is_active) VALUES($1,'NET3A 3025','other','pcs',3025,3025,FALSE,TRUE) ON CONFLICT (id) DO UPDATE SET price_per_unit=3025,company_price=3025,is_weighted=FALSE,is_active=TRUE", Guid.Parse(OrderProductId));
            await ExecuteAsync("INSERT INTO store_inventory(store_id,product_id,quantity,stock_quantity,selling_price,is_visible,status) VALUES($1,$2,20,20,NULL,TRUE,'available') ON CONFLICT (store_id,product_id) DO UPDATE SET quantity=20,stock_quantity=20,selling_price=NULL,is_visible=TRUE,status='available'", Guid.Parse(StoreId), Guid.Parse(OrderProductId));
        }
        public async Task<string> InsertPromoAsync(decimal amount, int? maxUses = null, int usagePerCustomer = 1)
        {
            var code = ("N3A" + Guid.NewGuid().ToString("N")[..16]).ToUpperInvariant();
            await using var command = data.CreateCommand("INSERT INTO promo_codes(store_id,code,discount_type,discount_value,min_order_value,max_uses,usage_per_customer,is_active) VALUES($1,$2,'fixed_amount',$3,0,$4,$5,TRUE)");
            command.Parameters.AddWithValue(Guid.Parse(StoreId)); command.Parameters.AddWithValue(code); command.Parameters.AddWithValue(amount);
            command.Parameters.AddWithValue(maxUses is null ? DBNull.Value : maxUses.Value); command.Parameters.AddWithValue(usagePerCustomer);
            await command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken); return code;
        }
        public async Task AssertPromoUsageAsync(string customerId, decimal? expected)
        {
            await using var command = data.CreateCommand("SELECT discount_amount FROM promo_code_usage WHERE customer_id=$1 ORDER BY created_at DESC"); command.Parameters.AddWithValue(Guid.Parse(customerId));
            await using var reader = await command.ExecuteReaderAsync(TestContext.Current.CancellationToken);
            if (expected is null) { Assert.False(await reader.ReadAsync(TestContext.Current.CancellationToken)); return; }
            Assert.True(await reader.ReadAsync(TestContext.Current.CancellationToken)); Assert.Equal(expected.Value, reader.GetDecimal(0)); Assert.False(await reader.ReadAsync(TestContext.Current.CancellationToken));
        }
        public async Task AssertFirstDiscountAsync(string customerId, bool expected)
        {
            await using var command = data.CreateCommand("SELECT is_used FROM first_order_discounts WHERE customer_id=$1"); command.Parameters.AddWithValue(Guid.Parse(customerId));
            Assert.Equal(expected, (bool)(await command.ExecuteScalarAsync(TestContext.Current.CancellationToken))!);
        }
        public async Task SetInventoryQuantityAsync(string productId, decimal quantity, int stockQuantity) => await ExecuteAsync("UPDATE store_inventory SET quantity=$3,stock_quantity=$4,status='available' WHERE store_id=$1 AND product_id=$2", Guid.Parse(StoreId), Guid.Parse(productId), quantity, stockQuantity);
        public async Task<decimal> InventoryQuantityAsync(string productId)
        {
            await using var command = data.CreateCommand("SELECT quantity FROM store_inventory WHERE store_id=$1 AND product_id=$2"); command.Parameters.AddWithValue(Guid.Parse(StoreId)); command.Parameters.AddWithValue(Guid.Parse(productId));
            return (decimal)(await command.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
        }
        public async Task<int> OrderCountAsync(params string[] customerIds)
        {
            await using var command = data.CreateCommand("SELECT COUNT(*)::int FROM orders WHERE customer_id=ANY($1)"); command.Parameters.AddWithValue(customerIds.Select(Guid.Parse).ToArray());
            return (int)(await command.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
        }
        public async Task<int> OrphanOrderCountAsync()
        {
            await using var command = data.CreateCommand("SELECT COUNT(*)::int FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN customer_addresses a ON a.id=o.delivery_address_id WHERE c.id IS NULL OR a.id IS NULL");
            return (int)(await command.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
        }
        public async Task<int> PromoUsageCountAsync(params string[] customerIds)
        {
            await using var command = data.CreateCommand("SELECT COUNT(*)::int FROM promo_code_usage WHERE customer_id=ANY($1)"); command.Parameters.AddWithValue(customerIds.Select(Guid.Parse).ToArray());
            return (int)(await command.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
        }
        public async Task<int> PaymentCountAsync(params string[] customerIds)
        {
            await using var command = data.CreateCommand("SELECT COUNT(*)::int FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.customer_id=ANY($1)"); command.Parameters.AddWithValue(customerIds.Select(Guid.Parse).ToArray());
            return (int)(await command.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
        }
        public Task AssertErrorParityAsync(HttpResponseMessage response)
        {
            Assert.Equal("application/json; charset=utf-8", response.Content.Headers.ContentType!.ToString());
            return Task.CompletedTask;
        }
        private async Task ExecuteAsync(string sql, params object[] parameters)
        {
            await using var command = data.CreateCommand(sql);
            foreach (var parameter in parameters) command.Parameters.AddWithValue(parameter);
            await command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        }
        private static async Task ResetAsync(string connectionString)
        {
            await using var data = NpgsqlDataSource.Create(connectionString);
            foreach (var sql in new[]
            {
                "DELETE FROM promo_code_usage",
                "DELETE FROM orders",
                "DELETE FROM customers",
                "DELETE FROM users WHERE role='customer'",
                "DELETE FROM promo_codes WHERE code LIKE 'N3A%'",
                "UPDATE store_inventory SET quantity=CASE product_id WHEN '33333333-3333-3333-3333-333333333333'::uuid THEN 50.000 WHEN '44444444-4444-4444-4444-444444444444'::uuid THEN 40.000 WHEN '55555555-5555-5555-5555-555555555555'::uuid THEN 30.000 WHEN '66666666-6666-6666-6666-666666666666'::uuid THEN 15.000 ELSE quantity END,stock_quantity=CASE product_id WHEN '55555555-5555-5555-5555-555555555555'::uuid THEN 30 ELSE 0 END,status='available'",
            })
            {
                await using var command = data.CreateCommand(sql);
                await command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
            }
        }
        public async ValueTask DisposeAsync() { data.Dispose(); Node.Dispose(); Dotnet.Dispose(); factory.Dispose(); await Task.CompletedTask; }
    }
}
