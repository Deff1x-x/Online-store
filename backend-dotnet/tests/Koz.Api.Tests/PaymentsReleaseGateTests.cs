using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Koz.Api.Configuration;
using Koz.Application.Auth;
using Koz.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Koz.Api.Tests;

public sealed class PaymentsReleaseGateTests
{
    [Fact]
    public void Production_defaults_online_initiation_to_disabled()
    {
        using var _ = ClearPaymentEnv();
        var options = PaymentsOptions.Load(new ConfigurationBuilder().Build(), new ProductionHostEnvironment { EnvironmentName = "Production" });
        Assert.False(options.OnlineInitiationEnabled);
    }

    [Fact]
    public void Non_production_defaults_online_initiation_to_enabled_for_parity()
    {
        using var _ = ClearPaymentEnv();
        var options = PaymentsOptions.Load(new ConfigurationBuilder().Build(), new ProductionHostEnvironment { EnvironmentName = "Testing" });
        Assert.True(options.OnlineInitiationEnabled);
    }

    [Fact]
    public void Production_rejects_explicit_enable_without_provider_contract()
    {
        using var _ = ClearPaymentEnv();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Payments:OnlineInitiationEnabled"] = "true" })
            .Build();
        var exception = Assert.Throws<PaymentsConfigurationException>(
            () => PaymentsOptions.Load(configuration, new ProductionHostEnvironment()));
        Assert.Contains("cannot be enabled in Production", exception.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Disabled_pay_online_returns_503_contract_without_placeholder_or_side_effects()
    {
        using var factory = new PaymentDisabledFactory();
        using var client = factory.CreateClient();
        var issuer = factory.Services.GetRequiredService<IAccessTokenIssuer>();
        var token = issuer.Issue(new AuthenticatedUser(
            Id: Guid.NewGuid().ToString(),
            Role: UserRole.Customer,
            StoreId: "11111111-1111-1111-1111-111111111111",
            CustomerId: Guid.NewGuid().ToString(),
            Email: null,
            Phone: "cutover-phone",
            Name: "Cutover",
            SubscriptionStatus: "active"));

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/payments/orders/11111111-1111-1111-1111-111111111111/pay-online")
        {
            Content = new StringContent("{}", Encoding.UTF8, "application/json"),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        var raw = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        using var body = JsonDocument.Parse(raw);
        Assert.Equal("online_payment_disabled", body.RootElement.GetProperty("code").GetString());
        Assert.False(body.RootElement.TryGetProperty("payment_url", out _));
        Assert.DoesNotContain("kaspi.placeholder", raw, StringComparison.OrdinalIgnoreCase);
    }

    private static IDisposable ClearPaymentEnv()
    {
        var keys = new[] { "PAYMENTS_ONLINE_INITIATION_ENABLED" };
        var prior = keys.ToDictionary(k => k, Environment.GetEnvironmentVariable);
        foreach (var key in keys) Environment.SetEnvironmentVariable(key, null);
        return new Restore(prior);
    }

    private sealed class Restore(Dictionary<string, string?> prior) : IDisposable
    {
        public void Dispose()
        {
            foreach (var pair in prior) Environment.SetEnvironmentVariable(pair.Key, pair.Value);
        }
    }

    private sealed class PaymentDisabledFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            Environment.SetEnvironmentVariable("DATABASE_PASSWORD", null);
            Environment.SetEnvironmentVariable("JWT_SECRET", null);
            Environment.SetEnvironmentVariable("OTP_SECRET", null);
            Environment.SetEnvironmentVariable("PAYMENTS_ONLINE_INITIATION_ENABLED", null);
            builder.UseEnvironment("Testing");
            builder.UseSetting("Database:Host", "localhost");
            builder.UseSetting("Database:Port", "5432");
            builder.UseSetting("Database:Name", "online_store");
            builder.UseSetting("Database:User", "postgres");
            builder.UseSetting("Database:Password", "test-password-not-default");
            builder.UseSetting("Database:ValidateOnStartup", "false");
            builder.UseSetting("Jwt:Secret", "payment-gate-jwt-secret-with-at-least-32-characters");
            builder.UseSetting("Otp:Secret", "payment-gate-otp-hmac-secret-with-at-least-32-ch");
            builder.UseSetting("Payments:OnlineInitiationEnabled", "false");
        }
    }
}
