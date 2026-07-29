using System.Text.Json.Serialization;

namespace Koz.Application.Read;

public sealed class ReadContractException(int statusCode, string message, string code) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public string Code { get; } = code;
}

public sealed record StoreCatalogProduct(
    [property: JsonPropertyName("product_id")] string ProductId,
    [property: JsonPropertyName("inventory_id")] string InventoryId,
    string Name,
    string Category,
    string Unit,
    [property: JsonPropertyName("is_weighted")] bool IsWeighted,
    [property: JsonPropertyName("price_per_unit")] string PricePerUnit,
    [property: JsonPropertyName("selling_price")] string? SellingPrice,
    string Quantity,
    string Status);

public sealed record StoreCatalogResponse(IReadOnlyList<StoreCatalogProduct> Products);

public sealed record PublicStoreListItem(
    string Id,
    string Name,
    string Address,
    string Status);

public sealed record StoresResponse(IReadOnlyList<PublicStoreListItem> Stores);

public sealed record ProfileUser(string Id, string? Name, string Phone, string? Email);

public sealed record ProfileCustomer(
    string Id,
    [property: JsonPropertyName("user_id")] string UserId,
    [property: JsonPropertyName("store_id")] string StoreId,
    string? Name,
    string Phone,
    string? Email,
    [property: JsonPropertyName("subscription_status")] string SubscriptionStatus,
    [property: JsonPropertyName("subscription_start_date")] string? SubscriptionStartDate,
    [property: JsonPropertyName("subscription_end_date")] string? SubscriptionEndDate,
    [property: JsonPropertyName("subscription_auto_renew")] bool SubscriptionAutoRenew);

public sealed record CustomerProfile(
    ProfileUser User,
    ProfileCustomer Customer,
    [property: JsonPropertyName("subscription_status")] string SubscriptionStatus,
    [property: JsonPropertyName("subscription_start_date")] string? SubscriptionStartDate,
    [property: JsonPropertyName("subscription_end_date")] string? SubscriptionEndDate,
    [property: JsonPropertyName("subscription_auto_renew")] bool SubscriptionAutoRenew);

public sealed record ProfileResponse(CustomerProfile Profile);

public sealed record CustomerAddress(
    string Id,
    [property: JsonPropertyName("customer_record_id")] string CustomerRecordId,
    [property: JsonPropertyName("store_coverage_id")] string StoreCoverageId,
    [property: JsonPropertyName("store_id")] string StoreId,
    [property: JsonPropertyName("coverage_address")] string CoverageAddress,
    [property: JsonPropertyName("entrance_count")] int? EntranceCount,
    string? Entrance,
    string? Floor,
    string? Apartment,
    [property: JsonPropertyName("entrance_code")] string? EntranceCode,
    [property: JsonPropertyName("is_default")] bool IsDefault,
    [property: JsonPropertyName("created_at")] string CreatedAt);

public sealed record AddressesResponse(IReadOnlyList<CustomerAddress> Addresses);

public sealed record CustomerAddressContext(string Id, string? StoreId, string? Phone, string Role, string? CustomerId);
