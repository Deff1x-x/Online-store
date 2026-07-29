using Koz.Application.Commerce;
using Xunit;

namespace Koz.Api.Tests;

public sealed class SubscriptionAccessRulesTests
{
    [Fact]
    public void Allows_ordering_on_end_date()
    {
        var end = new DateOnly(2026, 7, 1);
        Assert.True(SubscriptionAccessRules.AllowsOrdering("active", end, end));
    }

    [Fact]
    public void Allows_ordering_during_grace_day_3()
    {
        var end = new DateOnly(2026, 7, 1);
        Assert.True(SubscriptionAccessRules.AllowsOrdering("active", end, end.AddDays(3)));
        Assert.True(SubscriptionAccessRules.IsInGracePeriod(end, end.AddDays(2)));
    }

    [Fact]
    public void Denies_after_grace()
    {
        var end = new DateOnly(2026, 7, 1);
        Assert.False(SubscriptionAccessRules.AllowsOrdering("active", end, end.AddDays(4)));
    }

    [Fact]
    public void Denies_paused_even_inside_period()
    {
        var end = new DateOnly(2026, 8, 1);
        Assert.False(SubscriptionAccessRules.AllowsOrdering("paused", end, new DateOnly(2026, 7, 15)));
    }

    [Fact]
    public void Placeholder_token_is_deterministic()
    {
        var id = "11111111-1111-1111-1111-111111111111";
        Assert.Equal($"placeholder-recurring:{id}", SubscriptionAccessRules.IssuePlaceholderToken(id));
        Assert.Equal(3, SubscriptionAccessRules.GraceDays);
    }
}
