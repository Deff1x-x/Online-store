namespace Koz.Application.Orders;

public sealed class CustomerOrderService(ICustomerOrderRepository repository)
{
    public async Task<MyOrdersResponse> ListAsync(string? userId, CancellationToken cancellationToken) =>
        new(await repository.ListAsync(userId ?? string.Empty, cancellationToken));

    public async Task<MyOrderResponse> DetailAsync(string? userId, string orderId, CancellationToken cancellationToken)
    {
        var order = await repository.DetailAsync(userId ?? string.Empty, orderId, cancellationToken);
        return order is null
            ? throw new OrderContractException(404, "Order was not found", "order_not_found")
            : new MyOrderResponse(order);
    }
}
