using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;

namespace Koz.Api.Configuration;

/// <summary>
/// Marks readiness unhealthy as soon as the host begins shutting down so load balancers
/// stop sending new traffic while in-flight requests drain within ShutdownTimeout.
/// </summary>
public sealed class ShutdownReadinessHealthCheck(IHostApplicationLifetime lifetime) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        if (lifetime.ApplicationStopping.IsCancellationRequested || lifetime.ApplicationStopped.IsCancellationRequested)
        {
            return Task.FromResult(HealthCheckResult.Unhealthy("Application is shutting down."));
        }

        return Task.FromResult(HealthCheckResult.Healthy());
    }
}
