using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;
using Xunit;
using Xunit.Sdk;

namespace Koz.IntegrationTests;

public sealed class Net1AuthIntegrationTests
{
    private const string TestDatabaseName = "koz_dotnet_net1_test";
    private const string TestJwtSecret = "net1-testing-jwt-secret-with-at-least-32-characters";
    private static readonly string[] ProtectedRoutes =
    [
        "/__test/auth/customer",
        "/__test/auth/store-operator",
        "/__test/auth/admin-catalog",
        "/__test/auth/admin-operations",
        "/__test/auth/admin-customers",
    ];

    [Fact]
    [Trait("Category", "Integration")]
    public async Task Auth_endpoints_preserve_sessions_bcrypt_and_rbac_contracts()
    {
        var connectionString = GetConnectionStringOrSkip();
        using var factory = new Net1ApiFactory(connectionString);
        using var client = factory.CreateClient();
        using var dataSource = NpgsqlDataSource.Create(connectionString);

        await AssertStaffLoginsAndRbacAsync(client);

        var phone = $"n{Guid.NewGuid():N}"[..32];
        var missingConsent = await PostJsonAsync(client, "/api/auth/register", new
        {
            phone,
            code = "1234",
            name = "NET 1 customer",
            store_id = "11111111-1111-1111-1111-111111111111",
            privacy_policy = false,
            terms_of_service = true,
        });
        await AssertErrorAsync(missingConsent, HttpStatusCode.BadRequest, "consents_required", "Privacy policy and terms of service consents are required");

        var otp = await PostJsonAsync(client, "/api/auth/otp", new { phone });
        Assert.Equal(HttpStatusCode.OK, otp.StatusCode);
        using (var otpBody = await ReadJsonAsync(otp))
        {
            Assert.Equal(new[] { "expires_in_seconds", "message" }, otpBody.RootElement.EnumerateObject().Select(property => property.Name).Order());
            Assert.Equal("OTP code has been sent", otpBody.RootElement.GetProperty("message").GetString());
            Assert.Equal(300, otpBody.RootElement.GetProperty("expires_in_seconds").GetInt32());
        }

        var registered = await PostJsonAsync(client, "/api/auth/register", new
        {
            phone,
            code = "1234",
            name = "NET 1 customer",
            store_id = "11111111-1111-1111-1111-111111111111",
            privacy_policy = true,
            terms_of_service = true,
        });
        Assert.Equal(HttpStatusCode.Created, registered.StatusCode);
        var registration = await ReadTokenResponseAsync(registered, expectsRefreshToken: true);
        AssertCustomerTokenClaims(registration);
        Assert.Matches("^[A-Za-z0-9_-]{64}$", registration.RefreshToken!);
        await AssertRefreshHashStoredAsync(dataSource, registration.User.GetProperty("id").GetString()!, registration.RefreshToken!);
        await AssertRegistrationSideEffectsAsync(dataSource, registration);
        await AssertOnlyAuthorizedRouteAsync(client, registration.Token, "/__test/auth/customer");

        var reusedOtp = await PostJsonAsync(client, "/api/auth/login", new { phone, code = "1234" });
        await AssertErrorAsync(reusedOtp, HttpStatusCode.Forbidden, "invalid_otp", "Invalid or expired OTP code");

        var refresh = await PostJsonAsync(client, "/api/auth/refresh", new { refresh_token = registration.RefreshToken });
        Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);
        var rotated = await ReadTokenResponseAsync(refresh, expectsRefreshToken: true);
        Assert.NotEqual(registration.RefreshToken, rotated.RefreshToken);
        await AssertRefreshRotationAsync(dataSource, registration.User.GetProperty("id").GetString()!, registration.RefreshToken!, rotated.RefreshToken!);

        var oldRefresh = await PostJsonAsync(client, "/api/auth/refresh", new { refresh_token = registration.RefreshToken });
        await AssertErrorAsync(oldRefresh, HttpStatusCode.Unauthorized, "invalid_refresh_token", "Invalid or expired refresh token");

        var accessAsRefresh = await PostJsonAsync(client, "/api/auth/refresh", new { refresh_token = rotated.Token });
        await AssertErrorAsync(accessAsRefresh, HttpStatusCode.Unauthorized, "invalid_refresh_token", "Invalid or expired refresh token");

        await ExpireRefreshSessionAsync(dataSource, rotated.RefreshToken!);
        var expiredRefresh = await PostJsonAsync(client, "/api/auth/refresh", new { refresh_token = rotated.RefreshToken });
        await AssertErrorAsync(expiredRefresh, HttpStatusCode.Unauthorized, "invalid_refresh_token", "Invalid or expired refresh token");

        var loginOtp = await PostJsonAsync(client, "/api/auth/otp", new { phone });
        Assert.Equal(HttpStatusCode.OK, loginOtp.StatusCode);
        var login = await PostJsonAsync(client, "/api/auth/login", new { phone, code = "1234" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var customerLogin = await ReadTokenResponseAsync(login, expectsRefreshToken: true);

        var concurrent = await Task.WhenAll(
            PostJsonAsync(client, "/api/auth/refresh", new { refresh_token = customerLogin.RefreshToken }),
            PostJsonAsync(client, "/api/auth/refresh", new { refresh_token = customerLogin.RefreshToken }));
        Assert.Equal(1, concurrent.Count(response => response.StatusCode == HttpStatusCode.OK));
        Assert.Equal(1, concurrent.Count(response => response.StatusCode == HttpStatusCode.Unauthorized));

        var duplicateOtp = await PostJsonAsync(client, "/api/auth/otp", new { phone });
        Assert.Equal(HttpStatusCode.OK, duplicateOtp.StatusCode);
        var duplicate = await PostJsonAsync(client, "/api/auth/register", new
        {
            phone,
            code = "1234",
            name = "NET 1 customer",
            store_id = "11111111-1111-1111-1111-111111111111",
            privacy_policy = true,
            terms_of_service = true,
        });
        await AssertErrorAsync(duplicate, HttpStatusCode.Conflict, "duplicate_user_contact", "User with this phone already exists");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task Node_and_dotnet_auth_contracts_match_for_mounted_endpoints()
    {
        var connectionString = GetConnectionStringOrSkip();
        using var factory = new Net1ApiFactory(connectionString);
        using var dotnet = factory.CreateClient();
        using var node = await NodeAuthServer.StartAsync(connectionString, TestContext.Current.CancellationToken);

        await AssertEquivalentAsync(
            await PostJsonAsync(node.Client, "/api/auth/otp", new { phone = "node-parity-otp" }),
            await PostJsonAsync(dotnet, "/api/auth/otp", new { phone = "dotnet-parity-otp" }));

        await AssertEquivalentAsync(
            await PostJsonAsync(node.Client, "/api/auth/login", new { phone = "missing", code = "1234" }),
            await PostJsonAsync(dotnet, "/api/auth/login", new { phone = "missing", code = "1234" }));

        await AssertEquivalentAsync(
            await PostJsonAsync(node.Client, "/api/auth/staff/login", new { email = "manager@koz.kz", password = "incorrect" }),
            await PostJsonAsync(dotnet, "/api/auth/staff/login", new { email = "manager@koz.kz", password = "incorrect" }));

        var nodeStaff = await PostJsonAsync(node.Client, "/api/auth/staff/login", new { email = "manager@koz.kz", password = "Manager123" });
        var dotnetStaff = await PostJsonAsync(dotnet, "/api/auth/staff/login", new { email = "manager@koz.kz", password = "Manager123" });
        await AssertEquivalentAsync(nodeStaff, dotnetStaff);
        var nodeStaffResponse = await ReadTokenResponseAsync(nodeStaff, expectsRefreshToken: false);
        var dotnetStaffResponse = await ReadTokenResponseAsync(dotnetStaff, expectsRefreshToken: false);
        AssertEquivalentTokenClaims(nodeStaffResponse.Token, dotnetStaffResponse.Token);

        await AssertEquivalentAsync(
            await PostJsonAsync(node.Client, "/api/auth/refresh", new { refresh_token = "not-a-session" }),
            await PostJsonAsync(dotnet, "/api/auth/refresh", new { refresh_token = "not-a-session" }));

        var nodePhone = $"n{Guid.NewGuid():N}"[..32];
        var dotnetPhone = $"d{Guid.NewGuid():N}"[..32];
        Assert.Equal(HttpStatusCode.OK, (await PostJsonAsync(node.Client, "/api/auth/otp", new { phone = nodePhone })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await PostJsonAsync(dotnet, "/api/auth/otp", new { phone = dotnetPhone })).StatusCode);
        var nodeRegistration = await PostJsonAsync(node.Client, "/api/auth/register", CustomerRegistrationBody(nodePhone));
        var dotnetRegistration = await PostJsonAsync(dotnet, "/api/auth/register", CustomerRegistrationBody(dotnetPhone));
        await AssertEquivalentAsync(nodeRegistration, dotnetRegistration);
        var nodeRegistrationResponse = await ReadTokenResponseAsync(nodeRegistration, expectsRefreshToken: true);
        var dotnetRegistrationResponse = await ReadTokenResponseAsync(dotnetRegistration, expectsRefreshToken: true);
        AssertCustomerTokenClaims(nodeRegistrationResponse);
        AssertCustomerTokenClaims(dotnetRegistrationResponse);
        AssertEquivalentTokenClaims(nodeRegistrationResponse.Token, dotnetRegistrationResponse.Token);
    }

    private static async Task AssertStaffLoginsAndRbacAsync(HttpClient client)
    {
        var routes = new Dictionary<string, string>
        {
            ["manager@koz.kz"] = "/__test/auth/store-operator",
            ["catalog@koz.kz"] = "/__test/auth/admin-catalog",
            ["admin@koz.kz"] = "/__test/auth/admin-operations",
            ["customers@koz.kz"] = "/__test/auth/admin-customers",
        };

        foreach (var (email, route) in routes)
        {
            var response = await PostJsonAsync(client, "/api/auth/staff/login", new { email, password = "Manager123" });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var login = await ReadTokenResponseAsync(response, expectsRefreshToken: false);
            Assert.False(login.Root.TryGetProperty("refresh_token", out _));
            AssertStaffTokenClaims(login);
            await AssertOnlyAuthorizedRouteAsync(client, login.Token, route);
        }

        var wrongPassword = await PostJsonAsync(client, "/api/auth/staff/login", new { email = "manager@koz.kz", password = "incorrect" });
        await AssertErrorAsync(wrongPassword, HttpStatusCode.Unauthorized, "invalid_credentials", "Invalid email or password");

        var missingToken = await client.GetAsync("/__test/auth/customer", TestContext.Current.CancellationToken);
        await AssertErrorAsync(missingToken, HttpStatusCode.Unauthorized, "token_required", "Authorization token is required");

        var manager = await PostJsonAsync(client, "/api/auth/staff/login", new { email = "manager@koz.kz", password = "Manager123" });
        var managerLogin = await ReadTokenResponseAsync(manager, expectsRefreshToken: false);
        var forbidden = await AuthorizedGetAsync(client, "/__test/auth/admin-catalog", managerLogin.Token);
        await AssertErrorAsync(forbidden, HttpStatusCode.Forbidden, "access_denied", "Access denied");

        var invalidSignature = await AuthorizedGetAsync(client, "/__test/auth/store-operator", $"{managerLogin.Token}x");
        await AssertErrorAsync(invalidSignature, HttpStatusCode.Forbidden, "invalid_token", "Invalid or expired authorization token");

        var expiredToken = CreateTestToken(new Dictionary<string, object> { ["id"] = Guid.NewGuid().ToString(), ["role"] = "customer" }, DateTimeOffset.UtcNow.AddMinutes(-1));
        var expired = await AuthorizedGetAsync(client, "/__test/auth/customer", expiredToken);
        await AssertErrorAsync(expired, HttpStatusCode.Forbidden, "invalid_token", "Invalid or expired authorization token");

        var storeOperatorWithoutStore = CreateTestToken(new Dictionary<string, object> { ["id"] = Guid.NewGuid().ToString(), ["role"] = "store_operator" }, DateTimeOffset.UtcNow.AddMinutes(15));
        var missingStore = await AuthorizedGetAsync(client, "/__test/auth/store-operator", storeOperatorWithoutStore);
        await AssertErrorAsync(missingStore, HttpStatusCode.Forbidden, "access_denied", "Access denied");
    }

    private static async Task<HttpResponseMessage> PostJsonAsync(HttpClient client, string path, object body) =>
        await client.PostAsJsonAsync(path, body, TestContext.Current.CancellationToken);

    private static object CustomerRegistrationBody(string phone) => new
    {
        phone,
        code = "1234",
        name = "Contract parity customer",
        store_id = "11111111-1111-1111-1111-111111111111",
        privacy_policy = true,
        terms_of_service = true,
    };

    private static async Task<HttpResponseMessage> AuthorizedGetAsync(HttpClient client, string path, string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await client.SendAsync(request, TestContext.Current.CancellationToken);
    }

    private static async Task AssertOnlyAuthorizedRouteAsync(HttpClient client, string token, string permittedRoute)
    {
        foreach (var route in ProtectedRoutes)
        {
            var response = await AuthorizedGetAsync(client, route, token);
            if (route == permittedRoute)
            {
                Assert.Equal(HttpStatusCode.OK, response.StatusCode);
                continue;
            }

            await AssertErrorAsync(response, HttpStatusCode.Forbidden, "access_denied", "Access denied");
        }
    }

    private static async Task<TokenResponse> ReadTokenResponseAsync(HttpResponseMessage response, bool expectsRefreshToken)
    {
        var document = await ReadJsonAsync(response);
        var root = document.RootElement.Clone();
        document.Dispose();
        Assert.True(root.TryGetProperty("token", out var token));
        Assert.Equal(JsonValueKind.String, token.ValueKind);
        Assert.True(root.TryGetProperty("user", out var user));
        Assert.Equal(JsonValueKind.Object, user.ValueKind);
        var refreshToken = root.TryGetProperty("refresh_token", out var refresh) ? refresh.GetString() : null;
        Assert.Equal(expectsRefreshToken, refreshToken is not null);
        return new TokenResponse(root, token.GetString()!, refreshToken, user);
    }

    private static async Task<JsonDocument> ReadJsonAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));

    private static async Task AssertErrorAsync(HttpResponseMessage response, HttpStatusCode statusCode, string code, string message)
    {
        Assert.Equal(statusCode, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        using var payload = await ReadJsonAsync(response);
        Assert.Equal(new[] { "code", "message" }, payload.RootElement.EnumerateObject().Select(property => property.Name).Order());
        Assert.Equal(code, payload.RootElement.GetProperty("code").GetString());
        Assert.Equal(message, payload.RootElement.GetProperty("message").GetString());
    }

    private static async Task AssertEquivalentAsync(HttpResponseMessage node, HttpResponseMessage dotnet)
    {
        Assert.Equal(node.StatusCode, dotnet.StatusCode);
        Assert.Equal("application/json", node.Content.Headers.ContentType?.MediaType);
        Assert.Equal("application/json", dotnet.Content.Headers.ContentType?.MediaType);
        using var nodeBody = await ReadJsonAsync(node);
        using var dotnetBody = await ReadJsonAsync(dotnet);
        Assert.Equal(
            nodeBody.RootElement.EnumerateObject().Select(property => property.Name).Order(),
            dotnetBody.RootElement.EnumerateObject().Select(property => property.Name).Order());

        if (!node.IsSuccessStatusCode)
        {
            Assert.Equal(nodeBody.RootElement.GetProperty("message").GetString(), dotnetBody.RootElement.GetProperty("message").GetString());
            Assert.Equal(nodeBody.RootElement.GetProperty("code").GetString(), dotnetBody.RootElement.GetProperty("code").GetString());
        }
        else if (nodeBody.RootElement.TryGetProperty("user", out var nodeUser))
        {
            var dotnetUser = dotnetBody.RootElement.GetProperty("user");
            Assert.Equal(
                nodeUser.EnumerateObject().Select(property => property.Name).Order(),
                dotnetUser.EnumerateObject().Select(property => property.Name).Order());
        }
    }

    private static void AssertCustomerTokenClaims(TokenResponse response)
    {
        using var header = DecodeJwtHeader(response.Token);
        using var payload = DecodeJwtPayload(response.Token);
        Assert.Equal("HS256", header.RootElement.GetProperty("alg").GetString());
        Assert.Equal(new[] { "customer_id", "exp", "iat", "id", "phone", "role", "store_id" }, payload.RootElement.EnumerateObject().Select(property => property.Name).Order());
        Assert.Equal(response.User.GetProperty("id").GetString(), payload.RootElement.GetProperty("id").GetString());
        Assert.Equal("customer", payload.RootElement.GetProperty("role").GetString());
        Assert.Equal(response.User.GetProperty("role").GetString(), payload.RootElement.GetProperty("role").GetString());
        Assert.Equal(response.User.GetProperty("phone").GetString(), payload.RootElement.GetProperty("phone").GetString());
        Assert.Equal(response.User.GetProperty("store_id").GetString(), payload.RootElement.GetProperty("store_id").GetString());
        Assert.Equal(response.User.GetProperty("customer_id").GetString(), payload.RootElement.GetProperty("customer_id").GetString());
        Assert.True(Guid.TryParse(payload.RootElement.GetProperty("id").GetString(), out _));
        Assert.True(Guid.TryParse(payload.RootElement.GetProperty("customer_id").GetString(), out _));
        Assert.Equal(JsonValueKind.Number, payload.RootElement.GetProperty("iat").ValueKind);
        Assert.Equal(900, payload.RootElement.GetProperty("exp").GetInt64() - payload.RootElement.GetProperty("iat").GetInt64());
    }

    private static void AssertStaffTokenClaims(TokenResponse response)
    {
        using var payload = DecodeJwtPayload(response.Token);
        using var header = DecodeJwtHeader(response.Token);
        Assert.Equal("HS256", header.RootElement.GetProperty("alg").GetString());
        var expectedClaims = new List<string> { "email", "exp", "iat", "id", "role" };
        if (response.User.GetProperty("store_id").ValueKind is not JsonValueKind.Null)
        {
            expectedClaims.Add("store_id");
        }

        Assert.Equal(expectedClaims.Order(), payload.RootElement.EnumerateObject().Select(property => property.Name).Order());
        Assert.Equal(response.User.GetProperty("id").GetString(), payload.RootElement.GetProperty("id").GetString());
        Assert.Equal(response.User.GetProperty("email").GetString(), payload.RootElement.GetProperty("email").GetString());
        Assert.Equal(response.User.GetProperty("role").GetString(), payload.RootElement.GetProperty("role").GetString());
        if (response.User.GetProperty("store_id").ValueKind is not JsonValueKind.Null)
        {
            Assert.Equal(response.User.GetProperty("store_id").GetString(), payload.RootElement.GetProperty("store_id").GetString());
        }

        Assert.True(Guid.TryParse(payload.RootElement.GetProperty("id").GetString(), out _));
        Assert.Equal(900, payload.RootElement.GetProperty("exp").GetInt64() - payload.RootElement.GetProperty("iat").GetInt64());
    }

    private static JsonDocument DecodeJwtPayload(string token) => DecodeJwtPart(token, 1);
    private static JsonDocument DecodeJwtHeader(string token) => DecodeJwtPart(token, 0);

    private static JsonDocument DecodeJwtPart(string token, int partIndex)
    {
        var part = token.Split('.')[partIndex].Replace('-', '+').Replace('_', '/');
        part = part.PadRight(part.Length + (4 - part.Length % 4) % 4, '=');
        return JsonDocument.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(part)));
    }

    private static void AssertEquivalentTokenClaims(string nodeToken, string dotnetToken)
    {
        using var nodeHeader = DecodeJwtHeader(nodeToken);
        using var dotnetHeader = DecodeJwtHeader(dotnetToken);
        using var nodePayload = DecodeJwtPayload(nodeToken);
        using var dotnetPayload = DecodeJwtPayload(dotnetToken);
        Assert.Equal("HS256", nodeHeader.RootElement.GetProperty("alg").GetString());
        Assert.Equal("HS256", dotnetHeader.RootElement.GetProperty("alg").GetString());
        Assert.Equal(
            nodePayload.RootElement.EnumerateObject().Select(property => property.Name).Order(),
            dotnetPayload.RootElement.EnumerateObject().Select(property => property.Name).Order());
        foreach (var claim in nodePayload.RootElement.EnumerateObject())
        {
            Assert.Equal(claim.Value.ValueKind, dotnetPayload.RootElement.GetProperty(claim.Name).ValueKind);
        }

        Assert.Equal(900, nodePayload.RootElement.GetProperty("exp").GetInt64() - nodePayload.RootElement.GetProperty("iat").GetInt64());
        Assert.Equal(900, dotnetPayload.RootElement.GetProperty("exp").GetInt64() - dotnetPayload.RootElement.GetProperty("iat").GetInt64());
    }

    private static string CreateTestToken(Dictionary<string, object> claims, DateTimeOffset expiresAt)
    {
        var issuedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        claims["iat"] = issuedAt;
        claims["exp"] = expiresAt.ToUnixTimeSeconds();
        var header = Base64Url(Encoding.UTF8.GetBytes("{\"alg\":\"HS256\",\"typ\":\"JWT\"}"));
        var payload = Base64Url(JsonSerializer.SerializeToUtf8Bytes(claims));
        var signingInput = $"{header}.{payload}";
        var signature = Base64Url(HMACSHA256.HashData(Encoding.UTF8.GetBytes(TestJwtSecret), Encoding.UTF8.GetBytes(signingInput)));
        return $"{signingInput}.{signature}";
    }

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static async Task AssertRefreshHashStoredAsync(NpgsqlDataSource dataSource, string userId, string refreshToken)
    {
        await using var command = dataSource.CreateCommand("SELECT refresh_token_hash, expires_at FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1");
        command.Parameters.AddWithValue(Guid.Parse(userId));
        await using var reader = await command.ExecuteReaderAsync(TestContext.Current.CancellationToken);
        Assert.True(await reader.ReadAsync(TestContext.Current.CancellationToken));
        var storedHash = reader.GetString(0);
        var expectedHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(refreshToken))).ToLowerInvariant();
        Assert.Equal(expectedHash, storedHash);
        Assert.NotEqual(refreshToken, storedHash);
        var expiresAt = reader.GetFieldValue<DateTimeOffset>(1);
        Assert.InRange(expiresAt, DateTimeOffset.UtcNow.AddDays(29), DateTimeOffset.UtcNow.AddDays(31));
    }

    private static async Task AssertRefreshRotationAsync(NpgsqlDataSource dataSource, string userId, string oldRefreshToken, string newRefreshToken)
    {
        await using var command = dataSource.CreateCommand(
            """
            SELECT
              (SELECT revoked_at IS NOT NULL FROM user_sessions WHERE refresh_token_hash = $1),
              (SELECT user_id = $2 AND revoked_at IS NULL AND expires_at > NOW() + INTERVAL '29 days'
               FROM user_sessions WHERE refresh_token_hash = $3)
            """);
        command.Parameters.AddWithValue(Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(oldRefreshToken))).ToLowerInvariant());
        command.Parameters.AddWithValue(Guid.Parse(userId));
        command.Parameters.AddWithValue(Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(newRefreshToken))).ToLowerInvariant());
        await using var reader = await command.ExecuteReaderAsync(TestContext.Current.CancellationToken);
        Assert.True(await reader.ReadAsync(TestContext.Current.CancellationToken));
        Assert.True(reader.GetBoolean(0));
        Assert.True(reader.GetBoolean(1));
    }

    private static async Task AssertRegistrationSideEffectsAsync(NpgsqlDataSource dataSource, TokenResponse registration)
    {
        var userId = Guid.Parse(registration.User.GetProperty("id").GetString()!);
        var customerId = Guid.Parse(registration.User.GetProperty("customer_id").GetString()!);
        await using var command = dataSource.CreateCommand(
            """
            SELECT
              (SELECT role::text = 'customer' AND store_id = $1 FROM users WHERE id = $2),
              (SELECT user_id = $2 AND store_id = $1 AND subscription_status::text = 'expired' AND subscription_auto_renew = FALSE FROM customers WHERE id = $3),
              (SELECT privacy_policy AND terms_of_service FROM user_consents WHERE user_id = $2),
              (SELECT amount = 3000.00 AND is_used = FALSE FROM first_order_discounts WHERE customer_id = $3),
              (SELECT refresh_token_hash = $4 AND revoked_at IS NULL FROM user_sessions WHERE user_id = $2 ORDER BY created_at DESC LIMIT 1)
            """);
        command.Parameters.AddWithValue(Guid.Parse(registration.User.GetProperty("store_id").GetString()!));
        command.Parameters.AddWithValue(userId);
        command.Parameters.AddWithValue(customerId);
        command.Parameters.AddWithValue(Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(registration.RefreshToken!))).ToLowerInvariant());
        await using var reader = await command.ExecuteReaderAsync(TestContext.Current.CancellationToken);
        Assert.True(await reader.ReadAsync(TestContext.Current.CancellationToken));
        for (var ordinal = 0; ordinal < reader.FieldCount; ordinal++)
        {
            Assert.False(reader.IsDBNull(ordinal));
            Assert.True(reader.GetBoolean(ordinal));
        }
    }

    private static async Task ExpireRefreshSessionAsync(NpgsqlDataSource dataSource, string refreshToken)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(refreshToken))).ToLowerInvariant();
        await using var command = dataSource.CreateCommand("UPDATE user_sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE refresh_token_hash = $1");
        command.Parameters.AddWithValue(hash);
        Assert.Equal(1, await command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken));
    }

    private static string GetConnectionStringOrSkip()
    {
        var connectionString = Environment.GetEnvironmentVariable("KOZ_NET1_TEST_CONNECTION_STRING");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw SkipException.ForSkip("Set KOZ_NET1_TEST_CONNECTION_STRING to run NET-1 Auth integration tests.");
        }

        Assert.Equal(TestDatabaseName, new NpgsqlConnectionStringBuilder(connectionString).Database);
        return connectionString;
    }

    private sealed record TokenResponse(JsonElement Root, string Token, string? RefreshToken, JsonElement User);
}

public sealed class NodeAuthServer : IDisposable
{
    private NodeAuthServer(Process process, HttpClient client)
    {
        Process = process;
        Client = client;
    }

    public Process Process { get; }
    public HttpClient Client { get; }

    public static async Task<NodeAuthServer> StartAsync(string connectionString, CancellationToken cancellationToken)
    {
        var database = new NpgsqlConnectionStringBuilder(connectionString);
        var repositoryRoot = FindRepositoryRoot();
        var port = 3100;
        var startInfo = new ProcessStartInfo(Environment.GetEnvironmentVariable("NODE_EXE") ?? "node", "src/server.js")
        {
            WorkingDirectory = repositoryRoot,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        startInfo.Environment["NODE_ENV"] = "test";
        startInfo.Environment["PORT"] = port.ToString();
        startInfo.Environment["DATABASE_HOST"] = database.Host;
        startInfo.Environment["DATABASE_PORT"] = database.Port.ToString();
        startInfo.Environment["DATABASE_NAME"] = database.Database;
        startInfo.Environment["DATABASE_USER"] = database.Username;
        startInfo.Environment["DATABASE_PASSWORD"] = database.Password;
        startInfo.Environment["JWT_SECRET"] = "net1-testing-jwt-secret-with-at-least-32-characters";

        var process = Process.Start(startInfo) ?? throw new InvalidOperationException("Unable to start Node Auth server.");
        var client = new HttpClient { BaseAddress = new Uri($"http://localhost:{port}") };
        try
        {
            for (var attempt = 0; attempt < 30; attempt++)
            {
                if (process.HasExited)
                {
                    var error = await process.StandardError.ReadToEndAsync(cancellationToken);
                    throw new InvalidOperationException($"Node Auth server exited during startup: {error}");
                }

                try
                {
                    using var response = await client.GetAsync("/api/health", cancellationToken);
                    if (response.IsSuccessStatusCode)
                    {
                        return new NodeAuthServer(process, client);
                    }
                }
                catch (HttpRequestException)
                {
                    // The listener is still starting.
                }

                await Task.Delay(100, cancellationToken);
            }

            throw new TimeoutException("Node Auth server did not start in time.");
        }
        catch
        {
            client.Dispose();
            if (!process.HasExited)
            {
                process.Kill(true);
                await process.WaitForExitAsync(cancellationToken);
            }

            throw;
        }
    }

    public void Dispose()
    {
        Client.Dispose();
        if (!Process.HasExited)
        {
            Process.Kill(true);
            Process.WaitForExit();
        }

        Process.Dispose();
    }

    private static string FindRepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            if (File.Exists(Path.Combine(directory.FullName, "package.json")))
            {
                return directory.FullName;
            }
        }

        throw new DirectoryNotFoundException("Could not locate repository root containing package.json.");
    }
}

public sealed class Net1ApiFactory : WebApplicationFactory<Program>
{
    public Net1ApiFactory(string connectionString) => ConnectionString = new NpgsqlConnectionStringBuilder(connectionString);

    private NpgsqlConnectionStringBuilder ConnectionString { get; }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("Database:Host", ConnectionString.Host);
        builder.UseSetting("Database:Port", ConnectionString.Port.ToString());
        builder.UseSetting("Database:Name", ConnectionString.Database);
        builder.UseSetting("Database:User", ConnectionString.Username);
        builder.UseSetting("Database:Password", ConnectionString.Password);
        builder.UseSetting("Database:ValidateOnStartup", "true");
        builder.UseSetting("Jwt:Secret", "net1-testing-jwt-secret-with-at-least-32-characters");
    }
}
