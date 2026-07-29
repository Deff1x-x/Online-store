namespace Koz.Application.Orders;

/// <summary>TZ invariant 3 / А3: weighted qty step 0.1 kg; piece qty integers.</summary>
public static class OrderQuantityRules
{
    public static decimal RoundQuantity(decimal value) =>
        decimal.Round(value, 3, MidpointRounding.AwayFromZero);

    public static bool IsValidPieceQuantity(decimal quantity) =>
        decimal.Truncate(quantity) == quantity;

    public static bool IsValidWeightedStep(decimal quantity)
    {
        var normalized = RoundQuantity(quantity);
        return normalized == RoundQuantity(decimal.Round(quantity, 1, MidpointRounding.AwayFromZero));
    }
}
