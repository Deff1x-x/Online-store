namespace Koz.Application.Orders;

public interface IOrderRepository
{
    Task<OrderCreateResponse> CreateAsync(string userId, CreateOrderRequest request, CancellationToken cancellationToken);
}
public interface IManagerOrderRepository
{
    Task<IReadOnlyList<ManagerOrderDto>> ListAsync(string storeId, string? status, CancellationToken cancellationToken);
    Task<ManagerOrderDto> PickAsync(string storeId, string userId, string orderId, CancellationToken cancellationToken);
    Task<ManagerOrderDto> ActualWeightAsync(string storeId, string orderId, decimal actualWeight, CancellationToken cancellationToken);
    Task<ManagerOrderDto> UpdateStatusAsync(string storeId, string userId, string orderId, string deliveryStatus, CancellationToken cancellationToken);
}
public interface ICustomerOrderRepository
{
    Task<IReadOnlyList<CustomerOrderListDto>> ListAsync(string userId, CancellationToken cancellationToken);
    Task<CustomerOrderDetailDto?> DetailAsync(string userId, string orderId, CancellationToken cancellationToken);
}
