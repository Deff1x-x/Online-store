using System.Globalization;
using Koz.Application.Read;
using Npgsql;

namespace Koz.Infrastructure.Read;

public sealed class PostgresPublicReadRepository(NpgsqlDataSource dataSource) : IPublicReadRepository
{
    public async Task<IReadOnlyList<StoreCatalogProduct>> FindPublicStoreCatalogAsync(string storeId, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            SELECT
              p.id AS product_id,
              si.id AS inventory_id,
              p.name,
              p.category,
              p.unit,
              p.is_weighted,
              COALESCE(si.selling_price, p.price_per_unit) AS price_per_unit,
              si.selling_price,
              si.quantity,
              si.status
            FROM store_inventory si
            INNER JOIN products p ON p.id = si.product_id
            WHERE si.store_id = $1
              AND p.is_active = TRUE
              AND si.is_visible = TRUE
              AND si.quantity > 0
            ORDER BY p.category ASC, p.name ASC
            """,
            connection);
        command.Parameters.AddWithValue(Guid.Parse(storeId));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var products = new List<StoreCatalogProduct>();
        while (await reader.ReadAsync(cancellationToken))
        {
            products.Add(new StoreCatalogProduct(
                reader.GetGuid(0).ToString(),
                reader.GetGuid(1).ToString(),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetBoolean(5),
                FormatMoney(reader.GetDecimal(6)),
                ReadNullableMoney(reader, 7),
                FormatQuantity(reader.GetDecimal(8)),
                reader.GetString(9)));
        }

        return products;
    }

    public async Task<IReadOnlyList<PublicStoreListItem>> FindActiveStoresAsync(CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            SELECT id, name, address, status
            FROM stores
            WHERE status = 'active'
            ORDER BY name ASC
            """,
            connection);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var stores = new List<PublicStoreListItem>();
        while (await reader.ReadAsync(cancellationToken))
        {
            stores.Add(new PublicStoreListItem(
                reader.GetGuid(0).ToString(),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3)));
        }

        return stores;
    }

    public async Task<CustomerProfile?> FindProfileByUserIdAsync(string userId, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            SELECT
              u.id, u.name, u.phone, u.email,
              c.id, c.user_id, c.store_id, c.name, c.phone, c.email,
              c.subscription_status, c.subscription_start_date, c.subscription_end_date, c.subscription_auto_renew
            FROM users u
            JOIN customers c ON c.user_id = u.id
            WHERE u.id = $1
            """,
            connection);
        command.Parameters.AddWithValue(Guid.Parse(userId));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        var subscriptionStatus = reader.GetString(10);
        var customerSubscriptionStartDate = ReadNullableJsonDate(reader, 11);
        var customerSubscriptionEndDate = ReadNullableJsonDate(reader, 12);
        var subscriptionStartDate = ReadNullableDirectDate(reader, 11);
        var subscriptionEndDate = ReadNullableDirectDate(reader, 12);
        var subscriptionAutoRenew = reader.GetBoolean(13);
        return new CustomerProfile(
            new ProfileUser(reader.GetGuid(0).ToString(), ReadNullableString(reader, 1), reader.GetString(2), ReadNullableString(reader, 3)),
            new ProfileCustomer(
                reader.GetGuid(4).ToString(),
                reader.GetGuid(5).ToString(),
                reader.GetGuid(6).ToString(),
                ReadNullableString(reader, 7),
                reader.GetString(8),
                ReadNullableString(reader, 9),
                subscriptionStatus,
                customerSubscriptionStartDate,
                customerSubscriptionEndDate,
                subscriptionAutoRenew),
            subscriptionStatus,
            subscriptionStartDate,
            subscriptionEndDate,
            subscriptionAutoRenew);
    }

    public async Task<CustomerAddressContext?> FindCustomerAddressContextAsync(string userId, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            SELECT u.id, u.store_id, u.phone, u.role, c.id
            FROM users u
            LEFT JOIN customers c ON c.user_id = u.id
            WHERE u.id = $1
            """,
            connection);
        command.Parameters.AddWithValue(Guid.Parse(userId));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken)
            ? new CustomerAddressContext(
                reader.GetGuid(0).ToString(),
                ReadNullableGuid(reader, 1),
                ReadNullableString(reader, 2),
                reader.GetString(3),
                ReadNullableGuid(reader, 4))
            : null;
    }

    public async Task<IReadOnlyList<CustomerAddress>> FindAddressesByCustomerIdAsync(string customerId, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            SELECT
              customer_addresses.id,
              customer_addresses.customer_id AS customer_record_id,
              customer_addresses.store_coverage_id,
              store_coverage.store_id,
              store_coverage.address AS coverage_address,
              store_coverage.entrance_count,
              customer_addresses.entrance,
              customer_addresses.floor,
              customer_addresses.apartment,
              customer_addresses.entrance_code,
              customer_addresses.is_default,
              customer_addresses.created_at
            FROM customer_addresses
            INNER JOIN store_coverage ON store_coverage.id = customer_addresses.store_coverage_id
            WHERE customer_addresses.customer_id = $1
            ORDER BY customer_addresses.is_default DESC, customer_addresses.created_at DESC
            """,
            connection);
        command.Parameters.AddWithValue(Guid.Parse(customerId));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var addresses = new List<CustomerAddress>();
        while (await reader.ReadAsync(cancellationToken))
        {
            addresses.Add(new CustomerAddress(
                reader.GetGuid(0).ToString(),
                reader.GetGuid(1).ToString(),
                reader.GetGuid(2).ToString(),
                reader.GetGuid(3).ToString(),
                reader.GetString(4),
                reader.IsDBNull(5) ? null : reader.GetInt32(5),
                ReadNullableString(reader, 6),
                ReadNullableString(reader, 7),
                ReadNullableString(reader, 8),
                ReadNullableString(reader, 9),
                reader.GetBoolean(10),
                FormatTimestamp(reader.GetFieldValue<DateTimeOffset>(11))));
        }

        return addresses;
    }

    private static string? ReadNullableString(NpgsqlDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
    private static string? ReadNullableGuid(NpgsqlDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? null : reader.GetGuid(ordinal).ToString();
    private static string? ReadNullableMoney(NpgsqlDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? null : FormatMoney(reader.GetDecimal(ordinal));
    private static string? ReadNullableJsonDate(NpgsqlDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? null : reader.GetFieldValue<DateOnly>(ordinal).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    private static string? ReadNullableDirectDate(NpgsqlDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? null : FormatNodeDirectDate(reader.GetFieldValue<DateOnly>(ordinal));
    private static string FormatMoney(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);
    private static string FormatQuantity(decimal value) => value.ToString("0.000", CultureInfo.InvariantCulture);
    private static string FormatNodeDirectDate(DateOnly value)
    {
        var localMidnight = value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        return new DateTimeOffset(localMidnight, TimeZoneInfo.Local.GetUtcOffset(localMidnight))
            .ToUniversalTime()
            .ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
    }

    private static string FormatTimestamp(DateTimeOffset value) => value.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
