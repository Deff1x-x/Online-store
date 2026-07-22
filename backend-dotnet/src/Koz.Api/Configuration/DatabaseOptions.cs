using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Npgsql;

namespace Koz.Api.Configuration;

public sealed class DatabaseOptions
{
    private DatabaseOptions(string host, int port, string database, string username, string password, bool validateOnStartup)
    {
        Host = host;
        Port = port;
        Database = database;
        Username = username;
        Password = password;
        ValidateOnStartup = validateOnStartup;
        ConnectionString = new NpgsqlConnectionStringBuilder
        {
            Host = host,
            Port = port,
            Database = database,
            Username = username,
            Password = password,
            Pooling = true,
        }.ConnectionString;
    }

    public string Host { get; }
    public int Port { get; }
    public string Database { get; }
    public string Username { get; }
    public string Password { get; }
    public bool ValidateOnStartup { get; }
    public string ConnectionString { get; }

    public static DatabaseOptions Load(IConfiguration configuration) => Load(configuration, environment: null);

    public static DatabaseOptions Load(IConfiguration configuration, IHostEnvironment? environment)
    {
        var production = environment?.IsProduction() == true;
        var host = Get("DATABASE_HOST", configuration["Database:Host"], production ? null : "localhost");
        var portValue = Get("DATABASE_PORT", configuration["Database:Port"], production ? null : "5432");
        var database = Get("DATABASE_NAME", configuration["Database:Name"], production ? null : "online_store");
        var username = Get("DATABASE_USER", configuration["Database:User"], production ? null : "postgres");
        var password = Get("DATABASE_PASSWORD", configuration["Database:Password"], fallback: null);
        var validate = bool.TryParse(configuration["Database:ValidateOnStartup"], out var configuredValidate)
            ? configuredValidate
            : true;

        if (production)
        {
            var missing = new List<string>();
            if (string.IsNullOrWhiteSpace(host)) missing.Add("DATABASE_HOST");
            if (string.IsNullOrWhiteSpace(portValue)) missing.Add("DATABASE_PORT");
            if (string.IsNullOrWhiteSpace(database)) missing.Add("DATABASE_NAME");
            if (string.IsNullOrWhiteSpace(username)) missing.Add("DATABASE_USER");
            if (string.IsNullOrWhiteSpace(password)) missing.Add("DATABASE_PASSWORD");
            if (missing.Count > 0)
            {
                throw new DatabaseConfigurationException(
                    $"Missing required production database environment variables: {string.Join(", ", missing)}");
            }
        }

        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(database) || string.IsNullOrWhiteSpace(username))
        {
            throw new DatabaseConfigurationException("Database host, name, and user must be configured.");
        }

        if (!int.TryParse(portValue, out var port) || port is < 1 or > 65535)
        {
            throw new DatabaseConfigurationException("Database port must be an integer between 1 and 65535.");
        }

        if (string.IsNullOrWhiteSpace(password))
        {
            throw new DatabaseConfigurationException("Database password must be configured.");
        }

        if (production && password == "postgres")
        {
            throw new DatabaseConfigurationException("DATABASE_PASSWORD must not use the development default in production.");
        }

        return new DatabaseOptions(host!, port, database!, username!, password!, validate);
    }

    private static string? Get(string environmentName, string? configuredValue, string? fallback) =>
        Environment.GetEnvironmentVariable(environmentName)?.Trim()
        ?? configuredValue?.Trim()
        ?? fallback?.Trim();
}

public sealed class DatabaseConfigurationException(string message) : Exception(message);
