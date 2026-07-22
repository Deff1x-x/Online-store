using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Koz.Api.Auth;
using Koz.Api.Configuration;
using Koz.Application.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Koz.Api.Tests;

public sealed class CorsConfigurationTests
{
    [Fact]
    public void Production_with_empty_origins_fails_startup_configuration()
    {
        using var _ = EnvClear.DatabaseAndJwt();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Cors:AllowedOrigins:0"] = "" })
            .Build();

        var exception = Assert.Throws<CorsConfigurationException>(
            () => CorsOptions.Load(configuration, new NamedHostEnvironment("Production")));

        Assert.Contains("AllowedOrigins", exception.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Production_with_valid_origin_loads()
    {
        using var _ = EnvClear.DatabaseAndJwt();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Cors:AllowedOrigins:0"] = "https://app.example.com/",
            })
            .Build();

        var options = CorsOptions.Load(configuration, new NamedHostEnvironment("Production"));
        Assert.Equal(new[] { "https://app.example.com" }, options.AllowedOrigins);
    }

    [Fact]
    public void Wildcard_origin_is_rejected()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Cors:AllowedOrigins:0"] = "*" })
            .Build();

        Assert.Throws<CorsConfigurationException>(() => CorsOptions.Load(configuration, new NamedHostEnvironment("Development")));
    }

    [Fact]
    public async Task Production_allows_configured_origin_and_denies_others_including_preflight()
    {
        using var factory = new ProductionKozApiFactory();
        using var client = factory.CreateClient();

        using var allowed = new HttpRequestMessage(HttpMethod.Options, "/api/health");
        allowed.Headers.Add("Origin", "https://app.example.com");
        allowed.Headers.Add("Access-Control-Request-Method", "GET");
        using var allowedResponse = await client.SendAsync(allowed, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NoContent, allowedResponse.StatusCode);
        Assert.Equal("https://app.example.com", allowedResponse.Headers.GetValues("Access-Control-Allow-Origin").Single());

        using var get = new HttpRequestMessage(HttpMethod.Get, "/api/health");
        get.Headers.Add("Origin", "https://app.example.com");
        using var getResponse = await client.SendAsync(get, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        Assert.Equal("https://app.example.com", getResponse.Headers.GetValues("Access-Control-Allow-Origin").Single());

        using var denied = new HttpRequestMessage(HttpMethod.Options, "/api/health");
        denied.Headers.Add("Origin", "http://localhost:5173");
        denied.Headers.Add("Access-Control-Request-Method", "GET");
        using var deniedResponse = await client.SendAsync(denied, TestContext.Current.CancellationToken);
        Assert.False(deniedResponse.Headers.Contains("Access-Control-Allow-Origin"));
    }
}

public sealed class JwtEnvironmentTests
{
    [Fact]
    public void Development_allows_local_fallback_secret()
    {
        using var _ = EnvClear.DatabaseAndJwt();
        var options = JwtOptions.Load(new ConfigurationBuilder().Build(), new NamedHostEnvironment("Development"));
        Assert.Equal(JwtOptions.DevelopmentSecret, options.Secret);
    }

    [Fact]
    public void Staging_without_secret_fails()
    {
        using var _ = EnvClear.DatabaseAndJwt();
        var exception = Assert.Throws<AuthContractException>(
            () => JwtOptions.Load(new ConfigurationBuilder().Build(), new NamedHostEnvironment("Staging")));
        Assert.Equal("jwt_secret_invalid", exception.Code);
        Assert.DoesNotContain(JwtOptions.DevelopmentSecret, exception.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Testing_without_explicit_secret_fails()
    {
        using var _ = EnvClear.DatabaseAndJwt();
        var exception = Assert.Throws<AuthContractException>(
            () => JwtOptions.Load(new ConfigurationBuilder().Build(), new NamedHostEnvironment("Testing")));
        Assert.Equal("jwt_secret_invalid", exception.Code);
    }

    [Fact]
    public void Production_rejects_weak_secret()
    {
        using var _ = EnvClear.DatabaseAndJwt();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Jwt:Secret"] = "short" })
            .Build();
        var exception = Assert.Throws<AuthContractException>(
            () => JwtOptions.Load(configuration, new NamedHostEnvironment("Production")));
        Assert.Equal("jwt_secret_invalid", exception.Code);
        Assert.DoesNotContain("short", exception.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Production_accepts_valid_secret()
    {
        using var _ = EnvClear.DatabaseAndJwt();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = "production-test-jwt-secret-with-at-least-32-characters",
            })
            .Build();
        var options = JwtOptions.Load(configuration, new NamedHostEnvironment("Production"));
        Assert.True(options.Secret.Length >= 32);
    }
}

public sealed class KaspiWebhookSecurityTests
{
    [Theory]
    [InlineData("Development")]
    [InlineData("Staging")]
    [InlineData("Production")]
    public async Task Kaspi_webhook_is_fail_closed_without_side_effects(string environment)
    {
        using var factory = new ConfigurableEnvFactory(environment);
        using var client = factory.CreateClient();
        using var response = await client.PostAsync(
            "/api/webhooks/kaspi",
            new StringContent("""{"payment_id":"11111111-1111-1111-1111-111111111111","signature":"bad"}""", Encoding.UTF8, "application/json"),
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal("kaspi_webhook_disabled", payload.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Kaspi_webhook_malformed_missing_and_wrong_signature_stay_fail_closed()
    {
        using var factory = new ConfigurableEnvFactory("Development");
        using var client = factory.CreateClient();

        foreach (var body in new[] { "{", "{}", """{"payment_id":"x"}""", """{"signature":"wrong"}""" })
        {
            using var response = await client.PostAsync(
                "/api/webhooks/kaspi",
                new StringContent(body, Encoding.UTF8, "application/json"),
                TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
            using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
            Assert.Equal("kaspi_webhook_disabled", payload.RootElement.GetProperty("code").GetString());
        }
    }
}

public sealed class OtpLoggingTests
{
    [Fact]
    public async Task Otp_challenge_log_does_not_contain_code_or_phone()
    {
        var sink = new ListLoggerProvider();
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Testing");
            builder.UseSetting("Database:Password", "test-password");
            builder.UseSetting("Database:ValidateOnStartup", "false");
            builder.UseSetting("Jwt:Secret", "net1-testing-jwt-secret-with-at-least-32-characters");
            builder.UseSetting("Otp:Secret", "net1-testing-otp-hmac-secret-with-at-least-32-characters");
            builder.ConfigureServices(services =>
            {
                var existing = services.Where(descriptor => descriptor.ServiceType == typeof(IOtpChallengeStore)).ToList();
                foreach (var descriptor in existing)
                    services.Remove(descriptor);
                services.AddSingleton<IOtpChallengeStore, MemoryOtpChallengeStore>();
            });
            builder.ConfigureLogging(logging =>
            {
                logging.ClearProviders();
                logging.AddProvider(sink);
            });
        });
        using var client = factory.CreateClient();
        using var response = await client.PostAsJsonAsync("/api/auth/otp", new { phone = "+77001112233" }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var messages = sink.Messages;
        Assert.Contains(messages, message => message.Contains("OTP challenge created", StringComparison.Ordinal));
        Assert.DoesNotContain(messages, message => message.Contains("+77001112233", StringComparison.Ordinal));
        Assert.DoesNotContain(messages, message => message.Contains("1234", StringComparison.Ordinal));
        Assert.DoesNotContain(messages, message => message.Contains("SMS OTP", StringComparison.Ordinal));
    }
}

public sealed class ReadinessHealthTests
{
    [Fact]
    public async Task Ready_endpoint_returns_json_status_without_connection_details()
    {
        using var factory = new KozApiFactory();
        using var client = factory.CreateClient();
        using var response = await client.GetAsync("/health/ready", TestContext.Current.CancellationToken);
        Assert.True(response.StatusCode is HttpStatusCode.OK or HttpStatusCode.ServiceUnavailable);
        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.True(payload.RootElement.TryGetProperty("status", out var status));
        Assert.Contains(status.GetString(), new[] { "ready", "not_ready" });
        Assert.DoesNotContain("Password", await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Readiness_check_reports_unhealthy_without_leaking_connection_details()
    {
        var check = new PostgresReadinessHealthCheck(Npgsql.NpgsqlDataSource.Create("Host=127.0.0.1;Port=1;Database=missing;Username=x;Password=secret-must-not-leak"));
        var result = await check.CheckHealthAsync(new Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckContext(), TestContext.Current.CancellationToken);
        Assert.Equal(Microsoft.Extensions.Diagnostics.HealthChecks.HealthStatus.Unhealthy, result.Status);
        Assert.DoesNotContain("Password", result.Description ?? string.Empty, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("secret-must-not-leak", result.Description ?? string.Empty, StringComparison.Ordinal);
        Assert.Contains(result.Description, new[] { "PostgreSQL is unavailable.", "PostgreSQL readiness check timed out." });
    }
}

public sealed class AdminCustomerArrayConnectionRegressionTests
{
    [Fact]
    public void Array_does_not_open_a_second_connection_via_Scalar()
    {
        var path = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory,
            "..", "..", "..", "..", "..",
            "src", "Koz.Infrastructure", "AdminCustomers", "PostgresAdminCustomerRepository.cs"));
        Assert.True(File.Exists(path), path);
        var source = File.ReadAllText(path);
        Assert.DoesNotContain("JsonNode.Parse(await Scalar", source, StringComparison.Ordinal);
        Assert.Contains("await using var q=Cmd(c,null,s,x);return JsonNode.Parse((await q.ExecuteScalarAsync(ct))", source, StringComparison.Ordinal);
    }
}

file static class EnvClear
{
    public static IDisposable DatabaseAndJwt()
    {
        var keys = new[] { "DATABASE_HOST", "DATABASE_PORT", "DATABASE_NAME", "DATABASE_USER", "DATABASE_PASSWORD", "JWT_SECRET", "OTP_SECRET" };
        var prior = keys.ToDictionary(k => k, Environment.GetEnvironmentVariable);
        foreach (var key in keys)
            Environment.SetEnvironmentVariable(key, null);
        return new Restore(prior);
    }

    private sealed class Restore(Dictionary<string, string?> prior) : IDisposable
    {
        public void Dispose()
        {
            foreach (var pair in prior)
                Environment.SetEnvironmentVariable(pair.Key, pair.Value);
        }
    }
}

file sealed class NamedHostEnvironment(string name) : IWebHostEnvironment
{
    public string EnvironmentName { get; set; } = name;
    public string ApplicationName { get; set; } = "Koz.Api.Tests";
    public string WebRootPath { get; set; } = string.Empty;
    public Microsoft.Extensions.FileProviders.IFileProvider WebRootFileProvider { get; set; } = new Microsoft.Extensions.FileProviders.NullFileProvider();
    public string ContentRootPath { get; set; } = string.Empty;
    public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = new Microsoft.Extensions.FileProviders.NullFileProvider();
}

file sealed class ConfigurableEnvFactory(string environment) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        Environment.SetEnvironmentVariable("DATABASE_PASSWORD", null);
        Environment.SetEnvironmentVariable("JWT_SECRET", null);
        Environment.SetEnvironmentVariable("OTP_SECRET", null);
        builder.UseEnvironment(environment);
        builder.UseSetting("Database:Host", "localhost");
        builder.UseSetting("Database:Port", "5432");
        builder.UseSetting("Database:Name", "online_store");
        builder.UseSetting("Database:User", "postgres");
        builder.UseSetting("Database:Password", "test-password-not-default");
        builder.UseSetting("Database:ValidateOnStartup", "false");
        builder.UseSetting("Jwt:Secret", "production-test-jwt-secret-with-at-least-32-characters");
        builder.UseSetting("Otp:Secret", "production-test-otp-hmac-secret-with-at-least-32-ch");
        if (environment is "Production" or "Staging")
            builder.UseSetting("Cors:AllowedOrigins:0", "https://app.example.com");
    }
}

file sealed class ListLoggerProvider : ILoggerProvider
{
    public List<string> Messages { get; } = [];
    public ILogger CreateLogger(string categoryName) => new ListLogger(Messages);
    public void Dispose() { }

    private sealed class ListLogger(List<string> messages) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            messages.Add(formatter(state, exception));
    }
}

file sealed class MemoryOtpChallengeStore : IOtpChallengeStore
{
    private readonly Dictionary<string, (string Hash, DateTimeOffset ExpiresAt, DateTimeOffset? ConsumedAt)> _items = new(StringComparer.Ordinal);
    private readonly object _gate = new();

    public Task SaveAsync(string phone, string codeHash, int lifetimeSeconds, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
            _items[phone] = (codeHash, DateTimeOffset.UtcNow.AddSeconds(lifetimeSeconds), null);
        return Task.CompletedTask;
    }

    public Task<bool> TryConsumeAsync(string phone, string codeHash, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var now = DateTimeOffset.UtcNow;
        lock (_gate)
        {
            if (!_items.TryGetValue(phone, out var item)
                || item.ConsumedAt is not null
                || item.ExpiresAt <= now
                || !string.Equals(item.Hash, codeHash, StringComparison.Ordinal))
            {
                return Task.FromResult(false);
            }

            _items[phone] = item with { ConsumedAt = now };
            return Task.FromResult(true);
        }
    }
}
