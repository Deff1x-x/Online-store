namespace Koz.Application.Orders;

public interface IOrderRepository
{
    Task<OrderCreateResponse> CreateAsync(string userId, CreateOrderRequest request, CancellationToken cancellationToken);
}
