using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using Koz.Api.Configuration;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Koz.Api.Tests;

public sealed class HealthEndpointTests : IClassFixture<KozApiFactory>
{
    private readonly HttpClient _client;

    public HealthEndpointTests(KozApiFactory factory) => _client = factory.CreateClient();

    [Fact]
    public async Task GetHealth_returns_node_compatible_status_and_shape()
    {
        var response = await _client.GetAsync("/api/health", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        var root = payload.RootElement;
        Assert.Equal(new[] { "service", "status", "timestamp" }, root.EnumerateObject().Select(property => property.Name).Order());
        Assert.Equal("ok", root.GetProperty("status").GetString());
        Assert.Equal("koz-backend", root.GetProperty("service").GetString());
        var timestamp = root.GetProperty("timestamp").GetString();
        Assert.Matches(new Regex("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$"), timestamp);
        Assert.True(DateTimeOffset.TryParse(timestamp, out _));
    }

    [Fact]
    public async Task Unknown_route_preserves_node_error_shape()
    {
        var response = await _client.GetAsync("/api/not-a-route", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal(new[] { "code", "message" }, payload.RootElement.EnumerateObject().Select(property => property.Name).Order());
        Assert.Equal("Route not found", payload.RootElement.GetProperty("message").GetString());
        Assert.Equal("route_not_found", payload.RootElement.GetProperty("code").GetString());
    }

    [Theory]
    [InlineData("http://localhost:5173")]
    [InlineData("http://localhost:5174")]
    public async Task Development_cors_allows_only_configured_frontend_origins(string origin)
    {
        using var request = CreatePreflightRequest(origin);
        var response = await _client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(origin, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.Contains("authorization", response.Headers.GetValues("Access-Control-Allow-Headers").Single(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Development_swagger_documents_health_endpoint()
    {
        var response = await _client.GetAsync("/swagger/v1/swagger.json", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.True(payload.RootElement.GetProperty("paths").TryGetProperty("/api/health", out _));
    }

    private static HttpRequestMessage CreatePreflightRequest(string origin)
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/health");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "GET");
        request.Headers.Add("Access-Control-Request-Headers", "authorization");
        return request;
    }
}

public sealed class ProductionSurfaceTests
{
    [Fact]
    public async Task Production_does_not_expose_swagger_or_localhost_cors()
    {
        using var factory = new ProductionKozApiFactory();
        using var client = factory.CreateClient();
        using var swaggerResponse = await client.GetAsync("/swagger/index.html", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, swaggerResponse.StatusCode);

        using var request = new HttpRequestMessage(HttpMethod.Options, "/api/health");
        request.Headers.Add("Origin", "http://localhost:5173");
        request.Headers.Add("Access-Control-Request-Method", "GET");
        using var corsResponse = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.False(corsResponse.Headers.Contains("Access-Control-Allow-Origin"));
    }
}

public sealed class DatabaseConfigurationTests
{
    [Fact]
    public void Invalid_database_configuration_does_not_disclose_password()
    {
        const string password = "must-not-appear-in-errors";
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Database:Host"] = "localhost",
                ["Database:Port"] = "not-a-port",
                ["Database:Name"] = "online_store_test",
                ["Database:User"] = "postgres",
                ["Database:Password"] = password,
            })
            .Build();

        var exception = Assert.Throws<DatabaseConfigurationException>(() => DatabaseOptions.Load(configuration));

        Assert.DoesNotContain(password, exception.Message, StringComparison.Ordinal);
        Assert.Equal("Database port must be an integer between 1 and 65535.", exception.Message);
    }
}

public sealed class KozApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("Database:Password", "test-password");
        builder.UseSetting("Database:ValidateOnStartup", "false");
    }
}

public sealed class ProductionKozApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");
        builder.UseSetting("Database:Password", "test-password");
        builder.UseSetting("Database:ValidateOnStartup", "false");
    }
}
