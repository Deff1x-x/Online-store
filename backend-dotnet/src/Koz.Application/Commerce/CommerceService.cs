namespace Koz.Application.Commerce;
public sealed class CommerceService(ICommerceRepository repository, TimeProvider time)
{
    public async Task<CreateSubscriptionResponse> CreateAsync(string? userId, CreateSubscriptionRequest request, CancellationToken ct)
    {
        var customer = await CustomerForUser(userId, ct); var period = Period(request.BillingPeriod); var amount = Amount(request.Amount); var expires = AddPeriod(time.GetUtcNow(), period);
        var result = await repository.CreateSubscriptionAsync(customer.Id, amount, period, expires, ct);
        if (result.AlreadyActive) throw new CommerceContractException(409, "Subscription is already active", "subscription_already_active");
        return new(result.Subscription!, new(
            amount,
            "pending_provider_confirmation",
            SubscriptionAccessRules.GraceDays,
            "first charge confirmed by provider webhook; recurring handled by provider token",
            SubscriptionAccessRules.PlaceholderProvider,
            SubscriptionAccessRules.IssuePlaceholderToken(customer.Id)));
    }
    public async Task<SubscriptionResponse> RenewAsync(string customerId, CancellationToken ct) { var c = await CustomerById(customerId, ct); var period = c.LatestBillingPeriod ?? "monthly"; var basis = c.LatestExpiresAt is { } e && e > time.GetUtcNow() ? e : time.GetUtcNow(); return new(await repository.RenewAsync(c.Id, AddPeriod(basis, period), period, ct)); }
    public async Task<SubscriptionResponse> CancelAsync(string? userId, string? role, string customerId, CancelSubscriptionRequest request, CancellationToken ct) { var c = await CustomerById(customerId, ct); if (role != "admin_customers" && !(role == "customer" && c.UserId == userId)) throw new CommerceContractException(403, "Access denied", "access_denied"); var s = await repository.CancelAsync(c.Id, request.Immediate is true, ct); if (s is null) throw new CommerceContractException(404, "Active subscription was not found", "subscription_not_found"); return new(s); }
    public Task<SubscriptionsResponse> ListAsync(string? storeId, string? status, CancellationToken ct) => WrapList(storeId, status, ct);
    public async Task<PromoValidationResponse> ValidatePromoAsync(string? userId, PromoValidationRequest request, CancellationToken ct)
    {
        var code = (request.PromoCode ?? string.Empty).Trim().ToUpperInvariant(); if (code.Length == 0) throw new CommerceContractException(400, "promo_code is required", "promo_code_required"); if (request.OrderTotal is not { } total || total < 0) throw new CommerceContractException(400, "order_total must be greater than or equal to 0", "invalid_order_total");
        var c = await CustomerForUser(userId, ct); var p = await repository.FindPromoAsync(code, ct); if (p is null) return Invalid("Promo code was not found"); if (!p.IsActive) return Invalid("Promo code is inactive"); if (p.StoreId is not null && p.StoreId != c.StoreId) return Invalid("Promo code is not valid for this store"); var now = time.GetUtcNow(); if (p.ValidFrom is { } f && f > now) return Invalid("Promo code is not active yet"); if (p.ValidUntil is { } u && u < now) return Invalid("Promo code has expired"); if (p.MinOrderValue > total) return Invalid("Order total is below promo code minimum"); if (p.MaxUses is { } max && await repository.CountUsesAsync(p.Id, null, ct) >= max) return Invalid("Promo code usage limit reached"); if (await repository.CountUsesAsync(p.Id, c.Id, ct) >= p.UsagePerCustomer) return Invalid("Promo code customer usage limit reached"); var raw = p.DiscountType == "percentage" ? decimal.Round(total * p.DiscountValue / 100, 2, MidpointRounding.AwayFromZero) : p.DiscountValue; return new(true, Normalize(decimal.Round(decimal.Min(raw, total), 2, MidpointRounding.AwayFromZero)), null);
    }
    private async Task<CustomerCommerce> CustomerForUser(string? id, CancellationToken ct) => await repository.FindCustomerByUserIdAsync(id ?? string.Empty, ct) ?? throw new CommerceContractException(404, "Customer was not found", "customer_not_found");
    private async Task<CustomerCommerce> CustomerById(string id, CancellationToken ct) => await repository.FindCustomerByIdAsync(id, ct) ?? throw new CommerceContractException(404, "Customer was not found", "customer_not_found");
    private async Task<SubscriptionsResponse> WrapList(string? store, string? status, CancellationToken ct) => new(await repository.ListAsync(store, status, ct));
    private static string Period(string? p) => p is null or "" ? "monthly" : p is "monthly" or "yearly" ? p : throw new CommerceContractException(400, "Unsupported billing period", "invalid_billing_period");
    private static decimal Amount(decimal? a) => a is null ? 3900m : a <= 0 ? throw new CommerceContractException(400, "Subscription amount must be positive", "invalid_subscription_amount") : a.Value;
    private static DateTimeOffset AddPeriod(DateTimeOffset date, string p) => p == "yearly" ? date.AddYears(1) : date.AddMonths(1);
    private static PromoValidationResponse Invalid(string message) => new(false, 0m, message);
    private static decimal Normalize(decimal value) => decimal.Parse(value.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture), System.Globalization.CultureInfo.InvariantCulture);
}
