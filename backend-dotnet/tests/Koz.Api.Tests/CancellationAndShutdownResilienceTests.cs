using Koz.Api.Configuration;
using Koz.Api.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Koz.Api.Tests;

public sealed class CancellationAndShutdownResilienceTests
{
    [Fact]
    public async Task Request_abort_is_not_mapped_to_internal_error_500()
    {
        var middleware = new NodeCompatibleExceptionMiddleware(
            _ => throw new OperationCanceledException("aborted"),
            NullLogger<NodeCompatibleExceptionMiddleware>.Instance);
        var context = new DefaultHttpContext();
        context.Request.Method = "GET";
        context.Request.Path = "/api/products/store/x";
        context.RequestAborted = new CancellationToken(canceled: true);

        await middleware.InvokeAsync(context);

        Assert.Equal(StatusCodes.Status499ClientClosedRequest, context.Response.StatusCode);
    }

    [Fact]
    public async Task Unrelated_exception_still_maps_to_internal_error()
    {
        var middleware = new NodeCompatibleExceptionMiddleware(
            _ => throw new InvalidOperationException("boom"),
            NullLogger<NodeCompatibleExceptionMiddleware>.Instance);
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        await middleware.InvokeAsync(context);

        Assert.Equal(StatusCodes.Status500InternalServerError, context.Response.StatusCode);
    }

    [Fact]
    public async Task Shutdown_readiness_becomes_unhealthy_when_stopping()
    {
        var lifetime = new FakeHostLifetime();
        var check = new ShutdownReadinessHealthCheck(lifetime);
        Assert.Equal(
            HealthStatus.Healthy,
            (await check.CheckHealthAsync(new HealthCheckContext(), TestContext.Current.CancellationToken)).Status);

        lifetime.NotifyStopping();
        Assert.Equal(
            HealthStatus.Unhealthy,
            (await check.CheckHealthAsync(new HealthCheckContext(), TestContext.Current.CancellationToken)).Status);
    }

    [Fact]
    public void Database_options_expose_explicit_pool_and_timeout_defaults()
    {
        var keys = new[]
        {
            "DATABASE_HOST", "DATABASE_PORT", "DATABASE_NAME", "DATABASE_USER", "DATABASE_PASSWORD",
            "DATABASE_MAX_POOL_SIZE", "DATABASE_MIN_POOL_SIZE", "DATABASE_CONNECTION_TIMEOUT_SECONDS",
            "DATABASE_COMMAND_TIMEOUT_SECONDS", "DATABASE_CONNECTION_IDLE_LIFETIME_SECONDS",
        };
        var prior = keys.ToDictionary(k => k, Environment.GetEnvironmentVariable);
        foreach (var key in keys)
        {
            Environment.SetEnvironmentVariable(key, null);
        }

        try
        {
            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Database:Host"] = "localhost",
                    ["Database:Port"] = "5432",
                    ["Database:Name"] = "online_store",
                    ["Database:User"] = "postgres",
                    ["Database:Password"] = "postgres",
                })
                .Build();

            var options = DatabaseOptions.Load(configuration);
            Assert.Equal(100, options.MaxPoolSize);
            Assert.Equal(0, options.MinPoolSize);
            Assert.Equal(15, options.ConnectionTimeoutSeconds);
            Assert.Equal(30, options.CommandTimeoutSeconds);
            Assert.Contains("Maximum Pool Size=100", options.ConnectionString, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("Timeout=15", options.ConnectionString, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("Command Timeout=30", options.ConnectionString, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            foreach (var pair in prior)
            {
                Environment.SetEnvironmentVariable(pair.Key, pair.Value);
            }
        }
    }

    private sealed class FakeHostLifetime : IHostApplicationLifetime
    {
        private readonly CancellationTokenSource stopping = new();
        private readonly CancellationTokenSource stopped = new();

        public CancellationToken ApplicationStarted => CancellationToken.None;
        public CancellationToken ApplicationStopping => stopping.Token;
        public CancellationToken ApplicationStopped => stopped.Token;

        public void NotifyStopping() => stopping.Cancel();
        public void StopApplication() => NotifyStopping();
    }
}
