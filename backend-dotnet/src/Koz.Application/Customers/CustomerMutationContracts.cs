using System.Text.Json.Nodes;
namespace Koz.Application.Customers;
public sealed class CustomerMutationContractException(int status,string message,string code):Exception(message){public int StatusCode{get;}=status;public string Code{get;}=code;}
public interface ICustomerMutationRepository { Task<JsonObject> UpdateProfileAsync(string userId,JsonObject body,CancellationToken ct); Task<JsonObject> CreateAddressAsync(string userId,JsonObject body,CancellationToken ct); Task<JsonObject> DeleteAddressAsync(string userId,string id,CancellationToken ct); }
public sealed class CustomerMutationService(ICustomerMutationRepository r){public Task<JsonObject> UpdateProfileAsync(string id,JsonObject b,CancellationToken ct)=>r.UpdateProfileAsync(id,b,ct);public Task<JsonObject> CreateAddressAsync(string id,JsonObject b,CancellationToken ct)=>r.CreateAddressAsync(id,b,ct);public Task<JsonObject> DeleteAddressAsync(string id,string address,CancellationToken ct)=>r.DeleteAddressAsync(id,address,ct);}
