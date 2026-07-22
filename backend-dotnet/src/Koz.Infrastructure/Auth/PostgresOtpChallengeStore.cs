using Koz.Application.Auth;
using Npgsql;

namespace Koz.Infrastructure.Auth;

public sealed class PostgresOtpChallengeStore(NpgsqlDataSource dataSource) : IOtpChallengeStore
{
    public async Task SaveAsync(string phone, string codeHash, int lifetimeSeconds, CancellationToken cancellationToken)
    {
        const string sql =
            """
            INSERT INTO otp_challenges(phone, code_hash, created_at, expires_at, consumed_at)
            VALUES ($1, $2, NOW(), NOW() + make_interval(secs => $3), NULL)
            ON CONFLICT (phone) DO UPDATE
            SET code_hash = EXCLUDED.code_hash,
                created_at = NOW(),
                expires_at = NOW() + make_interval(secs => $3),
                consumed_at = NULL
            """;

        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(phone);
        command.Parameters.AddWithValue(codeHash);
        command.Parameters.AddWithValue(lifetimeSeconds);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<bool> TryConsumeAsync(string phone, string codeHash, CancellationToken cancellationToken)
    {
        // Expiry and consumed_at use PostgreSQL NOW() so multi-instance API clocks cannot skew TTL/single-use.
        const string sql =
            """
            UPDATE otp_challenges
            SET consumed_at = NOW()
            WHERE phone = $1
              AND code_hash = $2
              AND consumed_at IS NULL
              AND expires_at > NOW()
            RETURNING phone
            """;

        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(phone);
        command.Parameters.AddWithValue(codeHash);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is not null;
    }
}
