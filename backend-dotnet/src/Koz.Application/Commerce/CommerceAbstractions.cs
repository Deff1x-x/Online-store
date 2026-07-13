namespace Koz.Application.Commerce;
public interface ICommerceRepository
{
    Task<CustomerCommerce?> FindCustomerByUserIdAsync(string userId, CancellationToken ct);
    Task<CustomerCommerce?> FindCustomerByIdAsync(string customerId, CancellationToken ct);
    Task<CreateSubscriptionResult> CreateSubscriptionAsync(string customerId, decimal amount, string billingPeriod, DateTimeOffset expiresAt, CancellationToken ct);
    Task<SubscriptionDto> RenewAsync(string customerId, DateTimeOffset expiresAt, string billingPeriod, CancellationToken ct);
    Task<SubscriptionDto?> CancelAsync(string customerId, bool immediate, CancellationToken ct);
    Task<IReadOnlyList<SubscriptionListDto>> ListAsync(string? storeId, string? status, CancellationToken ct);
    Task<PromoCode?> FindPromoAsync(string code, CancellationToken ct);
    Task<int> CountUsesAsync(string promoId, string? customerId, CancellationToken ct);
}
public sealed record CustomerCommerce(string Id, string UserId, string StoreId, string? SubscriptionEndDate, string? LatestBillingPeriod, DateTimeOffset? LatestExpiresAt);
public sealed record CreateSubscriptionResult(bool AlreadyActive, SubscriptionDto? Subscription);
public sealed record PromoCode(string Id, string? StoreId, string DiscountType, decimal DiscountValue, decimal MinOrderValue, int? MaxUses, int UsagePerCustomer, DateTimeOffset? ValidFrom, DateTimeOffset? ValidUntil, bool IsActive);
