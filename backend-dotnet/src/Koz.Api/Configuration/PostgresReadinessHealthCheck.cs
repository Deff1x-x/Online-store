using Microsoft.Extensions.Diagnostics.HealthChecks;
using Npgsql;

namespace Koz.Api.Configuration;

public sealed class PostgresReadinessHealthCheck(NpgsqlDataSource dataSource) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(2));
            await using var command = dataSource.CreateCommand("SELECT 1");
            await command.ExecuteScalarAsync(timeout.Token);
            return HealthCheckResult.Healthy();
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return HealthCheckResult.Unhealthy("PostgreSQL readiness check timed out.");
        }
        catch (Exception)
        {
            return HealthCheckResult.Unhealthy("PostgreSQL is unavailable.");
        }
    }
}
