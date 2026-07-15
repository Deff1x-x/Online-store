using System.Text.Json;
using System.Text.Json.Serialization;

namespace Koz.Application.AdminCatalog;

public sealed record AdminCatalogStoreRequest(string? Name,string? Address,string? Location,[property:JsonPropertyName("operating_hours")]string? OperatingHours,[property:JsonPropertyName("delivery_time_min")]int? DeliveryTimeMin,[property:JsonPropertyName("delivery_time_max")]int? DeliveryTimeMax,string? Status);
public sealed record AdminCatalogCoverageRequest([property:JsonPropertyName("store_id")]string? StoreId,string? Address,[property:JsonPropertyName("entrance_count")]int? EntranceCount);
public sealed record AdminCatalogProductRequest(string? Name,string? Category,string? Unit,[property:JsonPropertyName("price_per_unit")]JsonElement PricePerUnit,[property:JsonPropertyName("company_price")]JsonElement CompanyPrice,[property:JsonPropertyName("is_weighted")]JsonElement IsWeighted,[property:JsonPropertyName("is_active")]JsonElement IsActive);
public sealed record AdminCatalogInventoryRequest([property:JsonPropertyName("selling_price")]JsonElement SellingPrice,JsonElement Quantity,[property:JsonPropertyName("is_visible")]JsonElement IsVisible);
public sealed record AdminCatalogPromoRequest(string? Code,[property:JsonPropertyName("discount_type")]string? DiscountType,[property:JsonPropertyName("discount_value")]JsonElement DiscountValue,[property:JsonPropertyName("store_id")]JsonElement StoreId,[property:JsonPropertyName("min_order_value")]JsonElement MinOrderValue,[property:JsonPropertyName("max_uses")]JsonElement MaxUses,[property:JsonPropertyName("usage_per_customer")]JsonElement UsagePerCustomer,[property:JsonPropertyName("valid_from")]JsonElement ValidFrom,[property:JsonPropertyName("valid_until")]JsonElement ValidUntil,[property:JsonPropertyName("is_active")]JsonElement IsActive);
public sealed record AdminCatalogDeliveryRequest([property:JsonPropertyName("min_order_value_for_free_delivery")]JsonElement Minimum,[property:JsonPropertyName("delivery_fee")]JsonElement Fee,[property:JsonPropertyName("ordering_open_hour")]JsonElement OpenHour,[property:JsonPropertyName("ordering_close_hour")]JsonElement CloseHour);
public sealed class AdminCatalogContractException(int status,string message,string code):Exception(message){public int StatusCode{get;}=status;public string Code{get;}=code;}
