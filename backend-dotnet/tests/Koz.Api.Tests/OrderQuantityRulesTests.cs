using Koz.Application.Orders;
using Xunit;

namespace Koz.Api.Tests;

public sealed class OrderQuantityRulesTests
{
    [Theory]
    [InlineData(0.1)]
    [InlineData(0.5)]
    [InlineData(1.0)]
    [InlineData(1.5)]
    [InlineData(12.3)]
    public void Weighted_step_0_1_accepted(decimal quantity) =>
        Assert.True(OrderQuantityRules.IsValidWeightedStep(quantity));

    [Theory]
    [InlineData(0.12)]
    [InlineData(1.23)]
    [InlineData(1.25)]
    [InlineData(2.01)]
    public void Weighted_non_0_1_rejected(decimal quantity) =>
        Assert.False(OrderQuantityRules.IsValidWeightedStep(quantity));

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    public void Piece_integers_accepted(decimal quantity) =>
        Assert.True(OrderQuantityRules.IsValidPieceQuantity(quantity));

    [Theory]
    [InlineData(1.5)]
    [InlineData(0.1)]
    public void Piece_fractions_rejected(decimal quantity) =>
        Assert.False(OrderQuantityRules.IsValidPieceQuantity(quantity));
}
