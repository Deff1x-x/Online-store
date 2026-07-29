namespace Koz.Application.Commerce;

/// <summary>
/// TZ А3: subscription activates immediately; grace 3 days after paid period end;
/// recurrent billed by provider token (placeholder adapter until acquiring contract).
/// </summary>
public static class SubscriptionAccessRules
{
    public const int GraceDays = 3;
    public const string PlaceholderProvider = "kaspi_placeholder";

    public static string IssuePlaceholderToken(string customerId) =>
        $"placeholder-recurring:{customerId}";

    /// <summary>
    /// Almaty calendar date: allow orders while status is active and today is on/before end+grace.
    /// Paused/cancelled/expired (or missing end) → deny.
    /// </summary>
    public static bool AllowsOrdering(string? status, DateOnly? subscriptionEndDate, DateOnly today)
    {
        if (!string.Equals(status, "active", StringComparison.Ordinal))
        {
            return false;
        }

        if (subscriptionEndDate is null)
        {
            return false;
        }

        var graceDeadline = subscriptionEndDate.Value.AddDays(GraceDays);
        return today <= graceDeadline;
    }

    public static bool IsInGracePeriod(DateOnly? subscriptionEndDate, DateOnly today) =>
        subscriptionEndDate is { } end && today > end && today <= end.AddDays(GraceDays);
}
