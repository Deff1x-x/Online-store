using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Koz.Application.AdminCatalog;

public sealed class AdminCatalogService(IAdminCatalogRepository repository)
{
    private static readonly HashSet<string> StoreStatuses = ["active", "inactive", "paused", "closed"];
    private static readonly HashSet<string> Categories = ["vegetables", "fruits", "dairy", "meat", "bakery", "other"];
    private static readonly HashSet<string> Units = ["kg", "pcs", "l"];

    public Task<JsonObject> StoresAsync(CancellationToken ct) => repository.ListStoresAsync(ct);

    public Task<JsonObject> CreateStoreAsync(AdminCatalogStoreRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Address))
            throw Error(400, "name and address are required", "store_required_fields");
        if (request.Status is not null && !StoreStatuses.Contains(request.Status))
            throw Error(400, "Invalid store status", "invalid_store_status");
        return repository.CreateStoreAsync(request, ct);
    }

    public Task<JsonObject> UpdateStoreAsync(string id, AdminCatalogStoreRequest request, CancellationToken ct)
    {
        Reference(id);
        if (request.Status is not null && !StoreStatuses.Contains(request.Status))
            throw Error(400, "Invalid store status", "invalid_store_status");
        return repository.UpdateStoreAsync(id, request, ct);
    }

    public Task<JsonObject> DeleteStoreAsync(string id, CancellationToken ct) { Reference(id); return repository.DeleteStoreAsync(id, ct); }

    public Task<JsonObject> CoverageAsync(AdminCatalogCoverageRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.StoreId) || string.IsNullOrWhiteSpace(request.Address))
            throw Error(400, "store_id and address are required", "coverage_required_fields");
        Reference(request.StoreId);
        return repository.UpsertCoverageAsync(request, ct);
    }

    public Task<JsonObject> ProductsAsync(CancellationToken ct) => repository.ListProductsAsync(ct);

    public Task<JsonObject> CreateProductAsync(AdminCatalogProductRequest request, CancellationToken ct)
    {
        ValidateProduct(request, partial: false);
        return repository.CreateProductAsync(NormalizeProduct(request), ct);
    }

    public Task<JsonObject> UpdateProductAsync(string id, AdminCatalogProductRequest request, CancellationToken ct)
    {
        Reference(id);
        ValidateProduct(request, partial: true);
        return repository.UpdateProductAsync(id, NormalizeProduct(request), ct);
    }

    public Task<JsonObject> DeleteProductAsync(string id, CancellationToken ct) { Reference(id); return repository.DeleteProductAsync(id, ct); }

    public Task<JsonObject> InventoryAsync(string store, CancellationToken ct) { Reference(store); return repository.ListInventoryAsync(store, ct); }

    public Task<JsonObject> UpsertInventoryAsync(string store, string product, AdminCatalogInventoryRequest request, CancellationToken ct)
    {
        Reference(store); Reference(product);
        var quantity = request.Quantity.ValueKind is JsonValueKind.Undefined ? 0m : Number(request.Quantity, "Invalid inventory quantity", "invalid_inventory_quantity");
        if (quantity < 0) throw Error(400, "Invalid inventory quantity", "invalid_inventory_quantity");
        if (request.SellingPrice.ValueKind is not (JsonValueKind.Undefined or JsonValueKind.Null))
        {
            var price = Number(request.SellingPrice, "Invalid selling_price", "invalid_selling_price");
            if (price < 0) throw Error(400, "Invalid selling_price", "invalid_selling_price");
        }
        if (request.IsVisible.ValueKind is not JsonValueKind.Undefined and not JsonValueKind.True and not JsonValueKind.False)
            throw Error(400, "is_visible must be boolean", "invalid_is_visible");
        return repository.UpsertInventoryAsync(store, product, request, ct);
    }

    public Task<JsonObject> ReceiveAsync(string store, string product, JsonElement quantity, CancellationToken ct)
    {
        Reference(store); Reference(product);
        var value = Number(quantity, "quantity must be greater than 0", "invalid_inventory_quantity");
        if (value <= 0) throw Error(400, "quantity must be greater than 0", "invalid_inventory_quantity");
        return repository.ReceiveInventoryAsync(store, product, quantity, ct);
    }

    public Task<JsonObject> PromosAsync(CancellationToken ct) => repository.ListPromosAsync(ct);

    public Task<JsonObject> CreatePromoAsync(AdminCatalogPromoRequest request, CancellationToken ct)
    {
        ValidatePromo(request, partial: false);
        return repository.CreatePromoAsync(request, ct);
    }

    public Task<JsonObject> UpdatePromoAsync(string id, AdminCatalogPromoRequest request, CancellationToken ct)
    {
        Reference(id);
        ValidatePromo(request, partial: true);
        return repository.UpdatePromoAsync(id, request, ct);
    }

    public Task<JsonObject> DeletePromoAsync(string id, CancellationToken ct) { Reference(id); return repository.DeletePromoAsync(id, ct); }
    public Task<JsonObject> DeliveryAsync(string store, CancellationToken ct) { Reference(store); return repository.GetDeliveryAsync(store, ct); }
    public Task<JsonObject> UpsertDeliveryAsync(string store, AdminCatalogDeliveryRequest request, CancellationToken ct) { Reference(store); return repository.UpsertDeliveryAsync(store, request, ct); }

    private static void ValidateProduct(AdminCatalogProductRequest request, bool partial)
    {
        if (!partial || request.Name is not null)
            if (string.IsNullOrWhiteSpace(request.Name)) throw Error(400, "name is required", "product_name_required");
        if (!partial || request.Category is not null)
            if (!TryCategory(request.Category, out _)) throw Error(400, "Invalid product category", "invalid_product_category");
        if (!partial || request.Unit is not null)
            if (request.Unit is null || !Units.Contains(request.Unit.Trim().ToLowerInvariant())) throw Error(400, "Invalid product unit", "invalid_product_unit");
        ValidatePrice(request.PricePerUnit, "price_per_unit", partial);
        ValidatePrice(request.CompanyPrice, "company_price", partial);
        ValidateBoolean(request.IsWeighted, "is_weighted", partial);
        ValidateBoolean(request.IsActive, "is_active", optional: true);
    }

    private static AdminCatalogProductRequest NormalizeProduct(AdminCatalogProductRequest request) =>
        request.Category is not null && TryCategory(request.Category, out var category)
            ? request with { Category = category, Unit = request.Unit?.Trim().ToLowerInvariant(), Name = request.Name?.Trim() }
            : request with { Unit = request.Unit?.Trim().ToLowerInvariant(), Name = request.Name?.Trim() };

    private static bool TryCategory(string? value, out string category)
    {
        category = value?.Trim().ToLowerInvariant() switch
        {
            "vegetable" or "vegetables" => "vegetables", "fruit" or "fruits" => "fruits",
            "dairy" => "dairy", "meat" => "meat", "bakery" => "bakery", "other" => "other", _ => string.Empty,
        };
        return Categories.Contains(category);
    }

    private static void ValidatePrice(JsonElement value, string field, bool optional)
    {
        if (optional && value.ValueKind is JsonValueKind.Undefined) return;
        var number = Number(value, $"Invalid {field}", $"invalid_{field}");
        if (number < 0) throw Error(400, $"Invalid {field}", $"invalid_{field}");
    }

    private static void ValidateBoolean(JsonElement value, string field, bool optional)
    {
        if (optional && value.ValueKind is JsonValueKind.Undefined) return;
        if (value.ValueKind is not JsonValueKind.True and not JsonValueKind.False)
            throw Error(400, $"{field} must be boolean", $"invalid_{field}");
    }

    private static void ValidatePromo(AdminCatalogPromoRequest request, bool partial)
    {
        if (!partial || request.Code is not null)
            if (string.IsNullOrWhiteSpace(request.Code)) throw Error(400, "code is required", "promo_code_required");
        if (!partial || request.DiscountType is not null)
            if (request.DiscountType is not ("fixed_amount" or "percentage")) throw Error(400, "Invalid discount_type", "invalid_discount_type");
        if (!partial || request.DiscountValue.ValueKind is not JsonValueKind.Undefined)
        {
            var value = Number(request.DiscountValue, "Invalid discount_value", "invalid_discount_value");
            if (value <= 0) throw Error(400, "Invalid discount_value", "invalid_discount_value");
        }
        if (request.MinOrderValue.ValueKind is not (JsonValueKind.Undefined or JsonValueKind.Null) && Number(request.MinOrderValue, "Invalid min_order_value", "invalid_min_order_value") < 0) throw Error(400, "Invalid min_order_value", "invalid_min_order_value");
        if (request.StoreId.ValueKind is not (JsonValueKind.Undefined or JsonValueKind.Null) && (request.StoreId.ValueKind != JsonValueKind.String || !Guid.TryParse(request.StoreId.GetString(), out _))) throw Error(400, "Invalid reference or UUID value", "invalid_reference");
        if (request.MaxUses.ValueKind is not (JsonValueKind.Undefined or JsonValueKind.Null) && (!request.MaxUses.TryGetInt32(out var max) || max < 0)) throw Error(400, "Invalid max_uses", "invalid_max_uses");
        if (request.UsagePerCustomer.ValueKind is not JsonValueKind.Undefined && (!request.UsagePerCustomer.TryGetInt32(out var usage) || usage <= 0)) throw Error(400, "Invalid usage_per_customer", "invalid_usage_per_customer");
        ValidateBoolean(request.IsActive, "is_active", optional: true);
    }

    private static decimal Number(JsonElement value, string message, string code)
    {
        if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number)) return number;
        if (value.ValueKind == JsonValueKind.String && decimal.TryParse(value.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out number)) return number;
        throw Error(400, message, code);
    }

    private static void Reference(string? value)
    {
        if (!Guid.TryParse(value, out _)) throw Error(400, "Invalid reference or UUID value", "invalid_reference");
    }

    private static AdminCatalogContractException Error(int status, string message, string code) => new(status, message, code);
}
