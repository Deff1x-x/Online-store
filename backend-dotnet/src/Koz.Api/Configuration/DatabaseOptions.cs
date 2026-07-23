using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Npgsql;

namespace Koz.Api.Configuration;

public sealed class DatabaseOptions
{
    private DatabaseOptions(
        string host,
        int port,
        string database,
        string username,
        string password,
        bool validateOnStartup,
        int maxPoolSize,
        int minPoolSize,
        int connectionTimeoutSeconds,
        int commandTimeoutSeconds,
        int connectionIdleLifetimeSeconds)
    {
        Host = host;
        Port = port;
        Database = database;
        Username = username;
        Password = password;
        ValidateOnStartup = validateOnStartup;
        MaxPoolSize = maxPoolSize;
        MinPoolSize = minPoolSize;
        ConnectionTimeoutSeconds = connectionTimeoutSeconds;
        CommandTimeoutSeconds = commandTimeoutSeconds;
        ConnectionIdleLifetimeSeconds = connectionIdleLifetimeSeconds;
        ConnectionString = new NpgsqlConnectionStringBuilder
        {
            Host = host,
            Port = port,
            Database = database,
            Username = username,
            Password = password,
            Pooling = true,
            MaxPoolSize = maxPoolSize,
            MinPoolSize = minPoolSize,
            Timeout = connectionTimeoutSeconds,
            CommandTimeout = commandTimeoutSeconds,
            ConnectionIdleLifetime = connectionIdleLifetimeSeconds,
        }.ConnectionString;
    }

    public string Host { get; }
    public int Port { get; }
    public string Database { get; }
    public string Username { get; }
    public string Password { get; }
    public bool ValidateOnStartup { get; }
    public int MaxPoolSize { get; }
    public int MinPoolSize { get; }
    public int ConnectionTimeoutSeconds { get; }
    public int CommandTimeoutSeconds { get; }
    public int ConnectionIdleLifetimeSeconds { get; }
    public string ConnectionString { get; }

    public static DatabaseOptions Load(IConfiguration configuration) => Load(configuration, environment: null);

    public static DatabaseOptions Load(IConfiguration configuration, IHostEnvironment? environment)
    {
        var production = environment?.IsProduction() == true;
        var maxPoolSize = ReadPositiveInt(configuration, "Database:MaxPoolSize", "DATABASE_MAX_POOL_SIZE", 100, 1, 500);
        var minPoolSize = ReadPositiveInt(configuration, "Database:MinPoolSize", "DATABASE_MIN_POOL_SIZE", 0, 0, maxPoolSize);
        var connectionTimeout = ReadPositiveInt(configuration, "Database:ConnectionTimeoutSeconds", "DATABASE_CONNECTION_TIMEOUT_SECONDS", 15, 1, 120);
        var commandTimeout = ReadPositiveInt(configuration, "Database:CommandTimeoutSeconds", "DATABASE_COMMAND_TIMEOUT_SECONDS", 30, 1, 300);
        var idleLifetime = ReadPositiveInt(configuration, "Database:ConnectionIdleLifetimeSeconds", "DATABASE_CONNECTION_IDLE_LIFETIME_SECONDS", 300, 30, 3600);
        var validate = bool.TryParse(configuration["Database:ValidateOnStartup"], out var configuredValidate)
            ? configuredValidate
            : true;

        // Explicit connection string (tests) bypasses ambient DATABASE_* process env to avoid cross-suite poisoning.
        var explicitConnectionString = configuration["Database:ConnectionString"]?.Trim();
        if (!string.IsNullOrWhiteSpace(explicitConnectionString))
        {
            var parsed = new NpgsqlConnectionStringBuilder(explicitConnectionString);
            if (string.IsNullOrWhiteSpace(parsed.Host) || string.IsNullOrWhiteSpace(parsed.Database) || string.IsNullOrWhiteSpace(parsed.Username))
            {
                throw new DatabaseConfigurationException("Database:ConnectionString must include Host, Database, and Username.");
            }

            if (string.IsNullOrWhiteSpace(parsed.Password))
            {
                throw new DatabaseConfigurationException("Database:ConnectionString must include Password.");
            }

            return new DatabaseOptions(
                parsed.Host,
                parsed.Port,
                parsed.Database,
                parsed.Username,
                parsed.Password,
                validate,
                maxPoolSize,
                minPoolSize,
                connectionTimeout,
                commandTimeout,
                idleLifetime);
        }

        var host = Get("DATABASE_HOST", configuration["Database:Host"], production ? null : "localhost");
        var portValue = Get("DATABASE_PORT", configuration["Database:Port"], production ? null : "5432");
        var database = Get("DATABASE_NAME", configuration["Database:Name"], production ? null : "online_store");
        var username = Get("DATABASE_USER", configuration["Database:User"], production ? null : "postgres");
        var password = Get("DATABASE_PASSWORD", configuration["Database:Password"], fallback: null);

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

        return new DatabaseOptions(
            host!,
            port,
            database!,
            username!,
            password!,
            validate,
            maxPoolSize,
            minPoolSize,
            connectionTimeout,
            commandTimeout,
            idleLifetime);
    }

    private static int ReadPositiveInt(
        IConfiguration configuration,
        string configKey,
        string environmentName,
        int defaultValue,
        int minInclusive,
        int maxInclusive)
    {
        var raw = Environment.GetEnvironmentVariable(environmentName)?.Trim()
            ?? configuration[configKey]?.Trim();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return defaultValue;
        }

        if (!int.TryParse(raw, out var value) || value < minInclusive || value > maxInclusive)
        {
            throw new DatabaseConfigurationException(
                $"{environmentName}/{configKey} must be an integer between {minInclusive} and {maxInclusive}.");
        }

        return value;
    }

    private static string? Get(string environmentName, string? configuredValue, string? fallback) =>
        Environment.GetEnvironmentVariable(environmentName)?.Trim()
            ?? configuredValue?.Trim()
            ?? fallback?.Trim();
}

public sealed class DatabaseConfigurationException(string message) : Exception(message);
