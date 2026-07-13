namespace Koz.Application.Orders;

public sealed class OrderService(IOrderRepository repository)
{
    public Task<OrderCreateResponse> CreateAsync(string? userId, CreateOrderRequest request, CancellationToken cancellationToken)
    {
        if (request.PaymentMethod != "online")
        {
            throw new OrderContractException(400, "payment_method must be online", "invalid_payment_method");
        }

        if (string.IsNullOrEmpty(request.DeliveryAddressId))
        {
            throw new OrderContractException(400, "delivery_address_id is required", "delivery_address_required");
        }

        if (request.Items is not { Count: > 0 })
        {
            throw new OrderContractException(400, "items must be a non-empty array", "order_items_required");
        }

        return repository.CreateAsync(userId ?? string.Empty, request, cancellationToken);
    }
}
