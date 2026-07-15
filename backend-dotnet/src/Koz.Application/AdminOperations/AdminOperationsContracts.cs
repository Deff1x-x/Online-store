using System.Text.Json;
namespace Koz.Application.AdminOperations;
public sealed record AdminOperationsQuery(string? Page,string? Limit,string? StoreId,string? Status,string? Method,string? DateFrom,string? DateTo);
public sealed record AdminOrderStatusRequest([property:System.Text.Json.Serialization.JsonPropertyName("delivery_status")]string? DeliveryStatus);
public sealed class AdminOperationsContractException(int status,string message,string code):Exception(message){public int StatusCode{get;}=status;public string Code{get;}=code;}
