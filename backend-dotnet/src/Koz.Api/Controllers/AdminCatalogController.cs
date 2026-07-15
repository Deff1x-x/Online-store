using System.Text.Json;
using System.Text.Json.Nodes;
using Koz.Api.Auth;
using Koz.Application.AdminCatalog;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace Koz.Api.Controllers;
[ApiController, Authorize(Policy=AuthPolicies.AdminCatalog)]
public sealed class AdminCatalogController(AdminCatalogService service):ControllerBase
{
 [HttpGet("api/admin/catalog/stores")] public Task<JsonObject> Stores(CancellationToken ct)=>service.StoresAsync(ct);
 [HttpPost("api/admin/catalog/stores")] public async Task<IActionResult> CreateStore(AdminCatalogStoreRequest body,CancellationToken ct)=>StatusCode(201,await service.CreateStoreAsync(body,ct));
 [HttpPut("api/admin/catalog/stores/{id}")] public Task<JsonObject> UpdateStore(string id,AdminCatalogStoreRequest body,CancellationToken ct)=>service.UpdateStoreAsync(id,body,ct);
 [HttpDelete("api/admin/catalog/stores/{id}")] public Task<JsonObject> DeleteStore(string id,CancellationToken ct)=>service.DeleteStoreAsync(id,ct);
 [HttpPost("api/admin/catalog/coverage")] public async Task<IActionResult> Coverage(AdminCatalogCoverageRequest body,CancellationToken ct){var response=await service.CoverageAsync(body,ct);var created=response["__created"]!.GetValue<bool>();response.Remove("__created");return StatusCode(created?201:200,response);}
 [HttpGet("api/admin/catalog/products")] public Task<JsonObject> Products(CancellationToken ct)=>service.ProductsAsync(ct);
 [HttpPost("api/admin/catalog/products")] public async Task<IActionResult> CreateProduct(AdminCatalogProductRequest body,CancellationToken ct)=>StatusCode(201,await service.CreateProductAsync(body,ct));
 [HttpPut("api/admin/catalog/products/{id}")] public Task<JsonObject> UpdateProduct(string id,AdminCatalogProductRequest body,CancellationToken ct)=>service.UpdateProductAsync(id,body,ct);
 [HttpDelete("api/admin/catalog/products/{id}")] public Task<JsonObject> DeleteProduct(string id,CancellationToken ct)=>service.DeleteProductAsync(id,ct);
 [HttpGet("api/admin/catalog/stores/{store}/inventory")] public Task<JsonObject> Inventory(string store,CancellationToken ct)=>service.InventoryAsync(store,ct);
 [HttpPut("api/admin/catalog/stores/{store}/inventory/{product}")] public Task<JsonObject> UpsertInventory(string store,string product,AdminCatalogInventoryRequest body,CancellationToken ct)=>service.UpsertInventoryAsync(store,product,body,ct);
 [HttpPost("api/admin/catalog/stores/{store}/inventory/{product}/incoming")] public Task<JsonObject> Receive(string store,string product,JsonElement body,CancellationToken ct)=>service.ReceiveAsync(store,product,body.GetProperty("quantity"),ct);
 [HttpGet("api/admin/catalog/promo-codes")] public Task<JsonObject> Promos(CancellationToken ct)=>service.PromosAsync(ct);
 [HttpPost("api/admin/catalog/promo-codes")] public async Task<IActionResult> CreatePromo(AdminCatalogPromoRequest body,CancellationToken ct)=>StatusCode(201,await service.CreatePromoAsync(body,ct));
 [HttpPut("api/admin/catalog/promo-codes/{id}")] public Task<JsonObject> UpdatePromo(string id,AdminCatalogPromoRequest body,CancellationToken ct)=>service.UpdatePromoAsync(id,body,ct);
 [HttpDelete("api/admin/catalog/promo-codes/{id}")] public Task<JsonObject> DeletePromo(string id,CancellationToken ct)=>service.DeletePromoAsync(id,ct);
 [HttpGet("api/admin/catalog/delivery-settings/{store}")] public Task<JsonObject> Delivery(string store,CancellationToken ct)=>service.DeliveryAsync(store,ct);
 [HttpPut("api/admin/catalog/delivery-settings/{store}")] public Task<JsonObject> UpsertDelivery(string store,AdminCatalogDeliveryRequest body,CancellationToken ct)=>service.UpsertDeliveryAsync(store,body,ct);
}
