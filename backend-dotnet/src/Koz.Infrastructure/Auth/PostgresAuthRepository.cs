using Koz.Application.Auth;
using Koz.Domain.Auth;
using Npgsql;

namespace Koz.Infrastructure.Auth;

public sealed class PostgresAuthRepository(NpgsqlDataSource dataSource) : IAuthRepository
{
    private const string CustomerUserSelect = """
        SELECT
          u.id,
          u.phone,
          u.email,
          u.name,
          u.store_id,
          u.role,
          c.id AS customer_id,
          c.subscription_status
        FROM users u
        LEFT JOIN customers c ON c.user_id = u.id
        """;

    public async Task<RegistrationResult> CreateCustomerRegistrationAsync(CustomerRegistration registration, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            await using var storeCommand = new NpgsqlCommand(
                "SELECT id FROM stores WHERE id = $1 AND status = 'active' FOR SHARE",
                connection,
                transaction);
            storeCommand.Parameters.AddWithValue(Guid.Parse(registration.StoreId));
            if (await storeCommand.ExecuteScalarAsync(cancellationToken) is null)
            {
                await transaction.RollbackAsync(cancellationToken);
                return new RegistrationResult(true, null);
            }

            var user = await InsertCustomerUserAsync(connection, transaction, registration, cancellationToken);
            var customer = await InsertCustomerAsync(connection, transaction, user, registration, cancellationToken);
            await InsertFirstOrderDiscountAsync(connection, transaction, customer.CustomerId!, cancellationToken);
            await InsertConsentsAsync(connection, transaction, user.Id, registration, cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return new RegistrationResult(false, user with
            {
                CustomerId = customer.CustomerId,
                SubscriptionStatus = customer.SubscriptionStatus,
            });
        }
        catch (PostgresException exception) when (exception.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            await transaction.RollbackAsync(cancellationToken);
            throw new DuplicateUserContactException();
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task<AuthenticatedUser?> FindCustomerByPhoneAsync(string phone, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand($"{CustomerUserSelect} WHERE u.phone = $1", connection);
        command.Parameters.AddWithValue(phone);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadCustomerUser(reader) : null;
    }

    public async Task<AuthenticatedUser?> FindStaffByEmailAsync(string email, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            "SELECT id, phone, email, name, store_id, password_hash, role FROM users WHERE email = $1 AND status = 'active'",
            connection);
        command.Parameters.AddWithValue(email);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadStaffUser(reader) : null;
    }

    public async Task CreateUserSessionAsync(UserSession session, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO user_sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
            VALUES ($1, $2, $3, $4::inet, $5)
            """,
            connection);
        command.Parameters.AddWithValue(Guid.Parse(session.UserId));
        command.Parameters.AddWithValue(session.RefreshTokenHash);
        command.Parameters.AddWithValue((object?)session.UserAgent ?? DBNull.Value);
        command.Parameters.AddWithValue((object?)session.IpAddress ?? DBNull.Value);
        command.Parameters.AddWithValue(session.ExpiresAt);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<AuthenticatedUser?> RotateRefreshSessionAsync(RefreshSessionRotation rotation, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            await using var sessionCommand = new NpgsqlCommand(
                $"""
                {CustomerUserSelect}
                JOIN user_sessions s ON s.user_id = u.id
                WHERE s.refresh_token_hash = $1
                  AND s.revoked_at IS NULL
                  AND s.expires_at > NOW()
                FOR UPDATE OF s
                """,
                connection,
                transaction);
            sessionCommand.Parameters.AddWithValue(rotation.RefreshTokenHash);
            await using var reader = await sessionCommand.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                await reader.CloseAsync();
                await transaction.RollbackAsync(cancellationToken);
                return null;
            }

            var user = ReadCustomerUser(reader);
            await reader.CloseAsync();

            await using var revokeCommand = new NpgsqlCommand(
                "UPDATE user_sessions SET revoked_at = NOW(), updated_at = NOW() WHERE refresh_token_hash = $1",
                connection,
                transaction);
            revokeCommand.Parameters.AddWithValue(rotation.RefreshTokenHash);
            await revokeCommand.ExecuteNonQueryAsync(cancellationToken);

            await using var createCommand = new NpgsqlCommand(
                """
                INSERT INTO user_sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
                VALUES ($1, $2, $3, $4::inet, $5)
                """,
                connection,
                transaction);
            createCommand.Parameters.AddWithValue(Guid.Parse(user.Id));
            createCommand.Parameters.AddWithValue(rotation.NewRefreshTokenHash);
            createCommand.Parameters.AddWithValue((object?)rotation.UserAgent ?? DBNull.Value);
            createCommand.Parameters.AddWithValue((object?)rotation.IpAddress ?? DBNull.Value);
            createCommand.Parameters.AddWithValue(rotation.ExpiresAt);
            await createCommand.ExecuteNonQueryAsync(cancellationToken);

            await transaction.CommitAsync(cancellationToken);
            return user;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<AuthenticatedUser> InsertCustomerUserAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        CustomerRegistration registration,
        CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO users (phone, name, store_id, role)
            VALUES ($1, $2, $3, 'customer')
            RETURNING id, phone, email, name, store_id, role
            """,
            connection,
            transaction);
        command.Parameters.AddWithValue(registration.Phone);
        command.Parameters.AddWithValue(registration.Name);
        command.Parameters.AddWithValue(Guid.Parse(registration.StoreId));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return new AuthenticatedUser(
            reader.GetGuid(0).ToString(),
            ParseRole(reader.GetString(5)),
            ReadGuid(reader, 4),
            null,
            ReadString(reader, 2),
            ReadString(reader, 1),
            ReadString(reader, 3),
            null);
    }

    private static async Task<AuthenticatedUser> InsertCustomerAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        AuthenticatedUser user,
        CustomerRegistration registration,
        CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO customers (user_id, store_id, name, phone, subscription_status, subscription_auto_renew)
            VALUES ($1, $2, $3, $4, 'expired', FALSE)
            RETURNING id AS customer_id, subscription_status
            """,
            connection,
            transaction);
        command.Parameters.AddWithValue(Guid.Parse(user.Id));
        command.Parameters.AddWithValue(Guid.Parse(registration.StoreId));
        command.Parameters.AddWithValue(registration.Name);
        command.Parameters.AddWithValue(registration.Phone);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return user with
        {
            CustomerId = reader.GetGuid(0).ToString(),
            SubscriptionStatus = reader.GetString(1),
        };
    }

    private static async Task InsertFirstOrderDiscountAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        string customerId,
        CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand(
            "INSERT INTO first_order_discounts (customer_id, amount, is_used) VALUES ($1, 3000.00, FALSE)",
            connection,
            transaction);
        command.Parameters.AddWithValue(Guid.Parse(customerId));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task InsertConsentsAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        string userId,
        CustomerRegistration registration,
        CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO user_consents (user_id, privacy_policy, terms_of_service, ip_address, user_agent)
            VALUES ($1, $2, $3, $4::inet, $5)
            """,
            connection,
            transaction);
        command.Parameters.AddWithValue(Guid.Parse(userId));
        command.Parameters.AddWithValue(registration.PrivacyPolicy);
        command.Parameters.AddWithValue(registration.TermsOfService);
        command.Parameters.AddWithValue((object?)registration.Context.IpAddress ?? DBNull.Value);
        command.Parameters.AddWithValue((object?)registration.Context.UserAgent ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static AuthenticatedUser ReadCustomerUser(NpgsqlDataReader reader) => new(
        reader.GetGuid(0).ToString(),
        ParseRole(reader.GetString(5)),
        ReadGuid(reader, 4),
        ReadGuid(reader, 6),
        ReadString(reader, 2),
        ReadString(reader, 1),
        ReadString(reader, 3),
        ReadString(reader, 7));

    private static AuthenticatedUser ReadStaffUser(NpgsqlDataReader reader) => new(
        reader.GetGuid(0).ToString(),
        ParseRole(reader.GetString(6)),
        ReadGuid(reader, 4),
        null,
        ReadString(reader, 2),
        ReadString(reader, 1),
        ReadString(reader, 3),
        null,
        ReadString(reader, 5));

    private static string? ReadString(NpgsqlDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
    private static string? ReadGuid(NpgsqlDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? null : reader.GetGuid(ordinal).ToString();

    private static UserRole ParseRole(string role) => UserRoles.TryParse(role, out var parsed)
        ? parsed
        : throw new InvalidOperationException($"Unknown role value '{role}'.");
}
