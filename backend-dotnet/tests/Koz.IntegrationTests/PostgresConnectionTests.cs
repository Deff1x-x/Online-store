using Npgsql;
using Xunit.Sdk;
using Xunit;

namespace Koz.IntegrationTests;

public sealed class PostgresConnectionTests
{
    private const string RequiredTestDatabaseName = "koz_dotnet_net0_test";

    [Fact]
    [Trait("Category", "Integration")]
    public async Task Configured_separate_test_database_accepts_a_connection()
    {
        var connectionString = Environment.GetEnvironmentVariable("KOZ_TEST_DATABASE_CONNECTION_STRING");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw SkipException.ForSkip("Set KOZ_TEST_DATABASE_CONNECTION_STRING to run PostgreSQL integration tests.");
        }

        var connectionStringBuilder = new NpgsqlConnectionStringBuilder(connectionString);
        Assert.Equal(RequiredTestDatabaseName, connectionStringBuilder.Database);

        await using var dataSource = NpgsqlDataSource.Create(connectionString);
        await using var command = dataSource.CreateCommand("SELECT 1");

        var result = await command.ExecuteScalarAsync(TestContext.Current.CancellationToken);

        Assert.Equal(1, Convert.ToInt32(result));
    }
}
