using Koz.Infrastructure.Postgres;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Koz.Api.Configuration;

public sealed class DatabaseConnectionValidator(
    DatabaseOptions options,
    NpgsqlDataSource dataSource,
    ILogger<DatabaseConnectionValidator> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!options.ValidateOnStartup)
        {
            logger.LogInformation("PostgreSQL startup validation is disabled by configuration.");
            return;
        }

        try
        {
            await using var command = dataSource.CreateCommand("SELECT 1");
            await command.ExecuteScalarAsync(cancellationToken);
            logger.LogInformation("PostgreSQL connection validated for {Host}:{Port}/{Database}.", options.Host, options.Port, options.Database);
        }
        catch (PostgresException exception)
        {
            logger.LogError(exception, "PostgreSQL startup validation failed for {Host}:{Port}/{Database}.", options.Host, options.Port, options.Database);
            throw new DatabaseConfigurationException("PostgreSQL connection failed. Check database host, port, name, user, and password.");
        }
        catch (NpgsqlException exception)
        {
            logger.LogError(exception, "PostgreSQL startup validation failed for {Host}:{Port}/{Database}.", options.Host, options.Port, options.Database);
            throw new DatabaseConfigurationException("PostgreSQL connection failed. Check database host, port, name, user, and password.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
