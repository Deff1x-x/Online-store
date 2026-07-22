using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Koz.Api.Auth;
using Koz.Application.Auth;
using Koz.Infrastructure.Auth;
using Microsoft.Extensions.Configuration;
using Npgsql;
using Xunit;
using Xunit.Sdk;

namespace Koz.IntegrationTests;

[Collection("NodeApi")]
public sealed class NetOtpSharedStorageIntegrationTests
{
    private const string TestDatabaseName = "koz_dotnet_otp_test";
    private const string JwtSecret = "net1-testing-jwt-secret-with-at-least-32-characters";
    private const string OtpSecret = "net1-testing-otp-hmac-secret-with-at-least-32-characters";

    [Fact, Trait("Category", "Integration")]
    public async Task Migration_creates_otp_challenges_table_idempotently()
    {
        var cs = GetConnectionStringOrSkip();
        await using var data = NpgsqlDataSource.Create(cs);
        await ApplyMigrationAsync(cs);
        await ApplyMigrationAsync(cs);
        await using var command = data.CreateCommand(
            """
            SELECT COUNT(*)::int
            FROM information_schema.tables
            WHERE table_schema = CURRENT_SCHEMA() AND table_name = 'otp_challenges'
            """);
        Assert.Equal(1, await command.ExecuteScalarAsync(TestContext.Current.CancellationToken));
        await using var index = data.CreateCommand(
            """
            SELECT COUNT(*)::int
            FROM pg_indexes
            WHERE schemaname = CURRENT_SCHEMA() AND indexname = 'idx_otp_challenges_expires_at'
            """);
        Assert.Equal(1, await index.ExecuteScalarAsync(TestContext.Current.CancellationToken));
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Repository_save_consume_wrong_code_expired_overwrite_and_plaintext_absent()
    {
        var cs = GetConnectionStringOrSkip();
        await ApplyMigrationAsync(cs);
        await using var data = NpgsqlDataSource.Create(cs);
        await ClearOtpAsync(data);
        var hasher = CreateHasher();
        var store = new PostgresOtpChallengeStore(data);
        var phone = "otp-repo-" + Guid.NewGuid().ToString("N")[..16];
        var hash = hasher.Hash(phone, "1234");

        await store.SaveAsync(phone, hash, 300, TestContext.Current.CancellationToken);
        Assert.False(await store.TryConsumeAsync(phone, hasher.Hash(phone, "9999"), TestContext.Current.CancellationToken));
        Assert.True(await store.TryConsumeAsync(phone, hash, TestContext.Current.CancellationToken));
        Assert.False(await store.TryConsumeAsync(phone, hash, TestContext.Current.CancellationToken));

        await using (var check = data.CreateCommand("SELECT code_hash, consumed_at IS NOT NULL FROM otp_challenges WHERE phone=$1"))
        {
            check.Parameters.AddWithValue(phone);
            await using var reader = await check.ExecuteReaderAsync(TestContext.Current.CancellationToken);
            Assert.True(await reader.ReadAsync(TestContext.Current.CancellationToken));
            Assert.Equal(hash, reader.GetString(0));
            Assert.DoesNotContain("1234", reader.GetString(0), StringComparison.Ordinal);
            Assert.True(reader.GetBoolean(1));
        }

        var expiredPhone = "otp-exp-" + Guid.NewGuid().ToString("N")[..16];
        await store.SaveAsync(expiredPhone, hasher.Hash(expiredPhone, "1234"), 300, TestContext.Current.CancellationToken);
        await using (var expire = data.CreateCommand("UPDATE otp_challenges SET expires_at = NOW() - interval '1 second' WHERE phone=$1"))
        {
            expire.Parameters.AddWithValue(expiredPhone);
            await expire.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        }

        Assert.False(await store.TryConsumeAsync(expiredPhone, hasher.Hash(expiredPhone, "1234"), TestContext.Current.CancellationToken));

        var overwritePhone = "otp-ow-" + Guid.NewGuid().ToString("N")[..16];
        var oldHash = hasher.Hash(overwritePhone, "1111");
        var newHash = hasher.Hash(overwritePhone, "2222");
        await store.SaveAsync(overwritePhone, oldHash, 300, TestContext.Current.CancellationToken);
        await store.SaveAsync(overwritePhone, newHash, 300, TestContext.Current.CancellationToken);
        Assert.False(await store.TryConsumeAsync(overwritePhone, oldHash, TestContext.Current.CancellationToken));
        Assert.True(await store.TryConsumeAsync(overwritePhone, newHash, TestContext.Current.CancellationToken));
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Repository_save_honours_cancellation()
    {
        var cs = GetConnectionStringOrSkip();
        await ApplyMigrationAsync(cs);
        await using var data = NpgsqlDataSource.Create(cs);
        var store = new PostgresOtpChallengeStore(data);
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            store.SaveAsync("otp-cancel", "hash", 300, cts.Token));
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Concurrent_consume_allows_exactly_one_success_across_five_resets()
    {
        var cs = GetConnectionStringOrSkip();
        await ApplyMigrationAsync(cs);
        await using var data = NpgsqlDataSource.Create(cs);
        var hasher = CreateHasher();
        var store = new PostgresOtpChallengeStore(data);

        for (var run = 0; run < 5; run++)
        {
            await ClearOtpAsync(data);
            var phone = $"otp-race-{run}-" + Guid.NewGuid().ToString("N")[..12];
            var hash = hasher.Hash(phone, "1234");
            await store.SaveAsync(phone, hash, 300, TestContext.Current.CancellationToken);

            using var barrier = new Barrier(5);
            var tasks = Enumerable.Range(0, 5).Select(_ => Task.Run(async () =>
            {
                barrier.SignalAndWait();
                return await store.TryConsumeAsync(phone, hash, TestContext.Current.CancellationToken);
            })).ToArray();
            var results = await Task.WhenAll(tasks);
            Assert.Equal(1, results.Count(x => x));
            Assert.Equal(4, results.Count(x => !x));
        }
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Auth_otp_survives_new_host_and_shared_db_between_two_factories()
    {
        var cs = GetConnectionStringOrSkip();
        await ApplyMigrationAsync(cs);
        await using var data = NpgsqlDataSource.Create(cs);
        await ClearOtpAsync(data);

        var phone = "otp-host-" + Guid.NewGuid().ToString("N")[..16];
        using (var factoryA = new Net1ApiFactory(cs))
        using (var clientA = factoryA.CreateClient())
        {
            using var otp = await clientA.PostAsJsonAsync("/api/auth/otp", new { phone }, TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.OK, otp.StatusCode);
        }

        await using (var plaintext = data.CreateCommand("SELECT code_hash FROM otp_challenges WHERE phone=$1"))
        {
            plaintext.Parameters.AddWithValue(phone);
            var hash = (string)(await plaintext.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
            Assert.DoesNotContain("1234", hash, StringComparison.Ordinal);
        }

        using var factoryB = new Net1ApiFactory(cs);
        using var clientB = factoryB.CreateClient();
        using var wrong = await clientB.PostAsJsonAsync("/api/auth/login", new { phone, code = "0000" }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Forbidden, wrong.StatusCode);
        using var login = await clientB.PostAsJsonAsync("/api/auth/login", new { phone, code = "1234" }, TestContext.Current.CancellationToken);
        // Contract: valid OTP for unknown customer → customer_not_found after consume (same as pre-shared-store AuthService).
        Assert.Equal(HttpStatusCode.NotFound, login.StatusCode);
        using var loginBody = JsonDocument.Parse(await login.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal("customer_not_found", loginBody.RootElement.GetProperty("code").GetString());
        using var reused = await clientB.PostAsJsonAsync("/api/auth/login", new { phone, code = "1234" }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Forbidden, reused.StatusCode);
        using var reusedBody = JsonDocument.Parse(await reused.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal("invalid_otp", reusedBody.RootElement.GetProperty("code").GetString());
    }

    [Fact, Trait("Category", "Integration")]
    public async Task Auth_http_concurrency_consume_matches_single_use_contract()
    {
        var cs = GetConnectionStringOrSkip();
        await ApplyMigrationAsync(cs);
        await using var data = NpgsqlDataSource.Create(cs);

        for (var run = 0; run < 5; run++)
        {
            await ClearOtpAsync(data);
            var phone = $"otp-http-{run}-" + Guid.NewGuid().ToString("N")[..12];
            using var factory = new Net1ApiFactory(cs);
            using var client = factory.CreateClient();
            using var otp = await client.PostAsJsonAsync("/api/auth/otp", new { phone }, TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.OK, otp.StatusCode);

            using var barrier = new Barrier(5);
            var tasks = Enumerable.Range(0, 5).Select(_ => Task.Run(async () =>
            {
                barrier.SignalAndWait();
                using var response = await client.PostAsJsonAsync("/api/auth/login", new { phone, code = "1234" }, TestContext.Current.CancellationToken);
                using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                return (response.StatusCode, body.RootElement.GetProperty("code").GetString());
            })).ToArray();
            var outcomes = await Task.WhenAll(tasks);
            // Winner consumes OTP then hits existing login contract for unknown customer.
            Assert.Equal(1, outcomes.Count(x => x.StatusCode == HttpStatusCode.NotFound && x.Item2 == "customer_not_found"));
            Assert.Equal(4, outcomes.Count(x => x.StatusCode == HttpStatusCode.Forbidden && x.Item2 == "invalid_otp"));
        }
    }

    [Fact]
    public void Otp_secret_rejects_missing_weak_jwt_reuse_and_whitespace()
    {
        using var _ = ClearSecrets();
        var development = OtpOptions.Load(new ConfigurationBuilder().Build(), new NamedEnv("Development"), JwtSecret);
        Assert.Equal(OtpOptions.DevelopmentSecret, development.Secret);

        var missing = Assert.Throws<AuthContractException>(() =>
            OtpOptions.Load(new ConfigurationBuilder().Build(), new NamedEnv("Production"), JwtSecret));
        Assert.Equal("otp_secret_invalid", missing.Code);
        Assert.DoesNotContain(OtpOptions.DevelopmentSecret, missing.Message, StringComparison.Ordinal);
        Assert.DoesNotContain(JwtSecret, missing.Message, StringComparison.Ordinal);

        var weak = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Otp:Secret"] = "short" })
            .Build();
        Assert.Throws<AuthContractException>(() => OtpOptions.Load(weak, new NamedEnv("Production"), JwtSecret));

        var whitespace = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Otp:Secret"] = "   " })
            .Build();
        Assert.Throws<AuthContractException>(() => OtpOptions.Load(whitespace, new NamedEnv("Testing"), JwtSecret));

        var sameAsJwt = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Otp:Secret"] = JwtSecret })
            .Build();
        Assert.Throws<AuthContractException>(() => OtpOptions.Load(sameAsJwt, new NamedEnv("Production"), JwtSecret));

        var valid = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Otp:Secret"] = OtpSecret })
            .Build();
        Assert.Equal(OtpSecret, OtpOptions.Load(valid, new NamedEnv("Production"), JwtSecret).Secret);
    }

    private static HmacOtpCodeHasher CreateHasher()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Otp:Secret"] = OtpSecret })
            .Build();
        return new HmacOtpCodeHasher(OtpOptions.Load(configuration, new NamedEnv("Testing"), JwtSecret));
    }

    private static string GetConnectionStringOrSkip()
    {
        var value = Environment.GetEnvironmentVariable("KOZ_OTP_TEST_CONNECTION_STRING");
        if (string.IsNullOrWhiteSpace(value))
            throw SkipException.ForSkip("Set KOZ_OTP_TEST_CONNECTION_STRING.");
        Assert.Equal(TestDatabaseName, new NpgsqlConnectionStringBuilder(value).Database);
        return value;
    }

    private static async Task ApplyMigrationAsync(string connectionString)
    {
        var path = FindMigrationPath();
        var sql = await File.ReadAllTextAsync(path, TestContext.Current.CancellationToken);
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
    }

    private static string FindMigrationPath()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, "database", "migrations", "003_otp_challenges.sql");
            if (File.Exists(candidate))
                return candidate;
            directory = directory.Parent;
        }

        throw new FileNotFoundException("003_otp_challenges.sql");
    }

    private static async Task ClearOtpAsync(NpgsqlDataSource data)
    {
        await using var command = data.CreateCommand("DELETE FROM otp_challenges");
        await command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
    }

    private static IDisposable ClearSecrets()
    {
        var keys = new[] { "JWT_SECRET", "OTP_SECRET" };
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

    private sealed class NamedEnv(string name) : Microsoft.AspNetCore.Hosting.IWebHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "tests";
        public string WebRootPath { get; set; } = string.Empty;
        public Microsoft.Extensions.FileProviders.IFileProvider WebRootFileProvider { get; set; } = new Microsoft.Extensions.FileProviders.NullFileProvider();
        public string ContentRootPath { get; set; } = string.Empty;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
