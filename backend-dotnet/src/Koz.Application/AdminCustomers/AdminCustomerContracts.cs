namespace Koz.Application.AdminCustomers;
public sealed record AdminCustomerQuery(string? Page,string? Limit,string? StoreId,string? SubscriptionStatus,string? Search);
public sealed record AdminSubscriptionQuery(string? StoreId,string? Status);
public sealed record AdminCancelRequest(bool? Immediate);
public sealed class AdminCustomerContractException(int status,string message,string code):Exception(message){public int StatusCode{get;}=status;public string Code{get;}=code;}
