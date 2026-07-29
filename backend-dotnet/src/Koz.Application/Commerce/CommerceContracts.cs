using System.Text.Json.Serialization;

namespace Koz.Application.Commerce;

public sealed record CreateSubscriptionRequest([property: JsonPropertyName("billing_period")] string? BillingPeriod, decimal? Amount);
public sealed record CancelSubscriptionRequest(bool? Immediate);
public sealed record PromoValidationRequest([property: JsonPropertyName("promo_code")] string? PromoCode, [property: JsonPropertyName("order_total")] decimal? OrderTotal);

public sealed record SubscriptionDto(string Id, [property: JsonPropertyName("customer_id")] string CustomerId, string Amount, [property: JsonPropertyName("billing_period")] string BillingPeriod, string Status, [property: JsonPropertyName("expires_at")] string? ExpiresAt, [property: JsonPropertyName("next_billing_date")] string? NextBillingDate, [property: JsonPropertyName("auto_renew")] bool AutoRenew, [property: JsonPropertyName("cancelled_at")] string? CancelledAt, [property: JsonPropertyName("created_at")] string CreatedAt, [property: JsonPropertyName("updated_at")] string UpdatedAt);
public sealed record SubscriptionListDto(string Id, [property: JsonPropertyName("customer_id")] string CustomerId, string Amount, [property: JsonPropertyName("billing_period")] string BillingPeriod, string Status, [property: JsonPropertyName("expires_at")] string? ExpiresAt, [property: JsonPropertyName("next_billing_date")] string? NextBillingDate, [property: JsonPropertyName("auto_renew")] bool AutoRenew, [property: JsonPropertyName("cancelled_at")] string? CancelledAt, [property: JsonPropertyName("created_at")] string CreatedAt, [property: JsonPropertyName("updated_at")] string UpdatedAt, [property: JsonPropertyName("customer_name")] string? CustomerName, [property: JsonPropertyName("customer_phone")] string? CustomerPhone, [property: JsonPropertyName("customer_email")] string? CustomerEmail, [property: JsonPropertyName("store_id")] string StoreId);
public sealed record SubscriptionsResponse(IReadOnlyList<SubscriptionListDto> Subscriptions);
public sealed record SubscriptionResponse(SubscriptionDto Subscription);
public sealed record SubscriptionPayment(
    decimal Amount,
    string Status,
    [property: JsonPropertyName("grace_days")] int GraceDays,
    string Note,
    string? Provider = null,
    [property: JsonPropertyName("provider_token")] string? ProviderToken = null);
public sealed record CreateSubscriptionResponse(SubscriptionDto Subscription, SubscriptionPayment Payment);
public sealed record PromoValidationResponse([property: JsonPropertyName("is_valid")] bool IsValid, [property: JsonPropertyName("discount_amount")] decimal DiscountAmount, [property: JsonPropertyName("error_message")] string? ErrorMessage);
public sealed class CommerceContractException(int statusCode, string message, string code) : Exception(message) { public int StatusCode { get; } = statusCode; public string Code { get; } = code; }
