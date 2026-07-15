using System.Globalization;
using System.Text.Json;
namespace Koz.Application.Orders;
public sealed class ManagerOrderService(IManagerOrderRepository repository)
{
 public Task<ManagerOrdersResponse> ListAsync(string? storeId,string? status,CancellationToken ct){var s=Store(storeId);if(status is not null&&status is not "new" and not "picked" and not "in_delivery" and not "delivered" and not "failed" and not "cancelled")throw new ManagerOrderContractException(400,"Invalid order status filter","invalid_order_status");return Wrap(repository.ListAsync(s,status,ct));}
 public Task<ManagerOrderResponse> PickAsync(string? store,string? user,string id,CancellationToken ct)=>Wrap(repository.PickAsync(Store(store),user??string.Empty,id,ct));
 public Task<ManagerOrderResponse> ActualWeightAsync(string? store,string id,ManagerActualWeightRequest body,CancellationToken ct){var w=Number(body.ActualWeight);if(w<=0)throw new ManagerOrderContractException(400,"actual_weight must be greater than 0","invalid_actual_weight");return Wrap(repository.ActualWeightAsync(Store(store),id,w,ct));}
 public Task<ManagerOrderResponse> UpdateStatusAsync(string? store,string? user,string id,ManagerOrderStatusRequest body,CancellationToken ct){if(string.IsNullOrEmpty(body.DeliveryStatus))throw new ManagerOrderContractException(400,"delivery_status is required","delivery_status_required");return Wrap(repository.UpdateStatusAsync(Store(store),user??string.Empty,id,body.DeliveryStatus,ct));}
 static string Store(string? s)=>string.IsNullOrEmpty(s)?throw new ManagerOrderContractException(403,"Store operator store_id is required","store_scope_required"):s;
 static decimal Number(JsonElement e)=>e.ValueKind switch{JsonValueKind.Number when e.TryGetDecimal(out var x)=>x,JsonValueKind.String when decimal.TryParse(e.GetString(),NumberStyles.Float,CultureInfo.InvariantCulture,out var x)=>x,_=>throw new ManagerOrderContractException(400,"actual_weight must be greater than 0","invalid_actual_weight")};
 static async Task<ManagerOrdersResponse> Wrap(Task<IReadOnlyList<ManagerOrderDto>> t)=>new(await t); static async Task<ManagerOrderResponse> Wrap(Task<ManagerOrderDto> t)=>new(await t);
}
