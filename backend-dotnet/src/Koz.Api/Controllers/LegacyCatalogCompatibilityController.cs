using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Koz.Api.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace Koz.Api.Controllers;

/// <summary>
/// Mounted Node parity for products.routes.js + promocodes.routes.js (admin catalog writes/lists).
/// Source of truth: products.service/repository.js and promocodes.service/repository.js.
/// </summary>
[ApiController]
[Authorize(Policy = AuthPolicies.AdminCatalog)]
public sealed class LegacyCatalogCompatibilityController(NpgsqlDataSource dataSource) : ControllerBase
{
    private static readonly Dictionary<string, string> CategoryMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["vegetables"] = "vegetables",
        ["vegetable"] = "vegetables",
        ["fruits"] = "fruits",
        ["fruit"] = "fruits",
        ["dairy"] = "dairy",
        ["meat"] = "meat",
        ["bakery"] = "bakery",
        ["other"] = "other",
    };

    private static readonly HashSet<string> Units = new(StringComparer.OrdinalIgnoreCase) { "kg", "pcs", "l" };

    private const string ProductJson =
        "json_build_object('id',id,'name',name,'category',category,'unit',unit,'price_per_unit',price_per_unit::text,'company_price',company_price::text,'is_weighted',is_weighted,'is_active',is_active,'created_at',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),'updated_at',to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))::text";

    private const string PromoJson =
        "json_build_object('id',id,'store_id',store_id,'code',code,'discount_type',discount_type,'discount_value',discount_value::text,'min_order_value',min_order_value::text,'max_uses',max_uses,'usage_per_customer',usage_per_customer,'valid_from',CASE WHEN valid_from IS NULL THEN NULL ELSE to_char(valid_from AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') END,'valid_until',CASE WHEN valid_until IS NULL THEN NULL ELSE to_char(valid_until AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') END,'is_active',is_active,'created_at',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),'updated_at',to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))::text";

    [HttpPost("api/products")]
    public async Task<IActionResult> CreateProduct([FromBody] JsonObject body, CancellationToken ct)
    {
        var name = (Text(body, "name") ?? string.Empty).Trim();
        var categoryRaw = Text(body, "category");
        var unitRaw = Text(body, "unit");
        var hasPrice = TryNumber(body, "price_per_unit", out var pricePerUnit, out var priceFinite);
        var hasCompany = TryNumber(body, "company_price", out var companyPrice, out var companyFinite);
        var isWeighted = Bool(body, "is_weighted");
        var hasIsActive = body.ContainsKey("is_active");
        var isActive = hasIsActive ? Bool(body, "is_active") : true;

        // Node: !name || !category || !unit — empty strings fail the required-fields check first.
        if (string.IsNullOrEmpty(name) || string.IsNullOrEmpty(categoryRaw) || string.IsNullOrEmpty(unitRaw) || !hasPrice || !hasCompany)
            return BadRequest(Error("name, category, unit, price_per_unit and company_price are required", "product_required_fields"));

        if (!CategoryMap.TryGetValue(categoryRaw.Trim(), out var category))
            return BadRequest(Error("Invalid product category", "invalid_product_category"));

        var unit = unitRaw.Trim().ToLowerInvariant();
        if (!Units.Contains(unit))
            return BadRequest(Error("Invalid product unit", "invalid_product_unit"));

        if (!priceFinite || pricePerUnit < 0)
            return BadRequest(Error("price_per_unit must be greater than or equal to 0", "invalid_price_per_unit"));

        if (!companyFinite || companyPrice < 0)
            return BadRequest(Error("company_price must be greater than or equal to 0", "invalid_company_price"));

        if (isWeighted is null)
            return BadRequest(Error("is_weighted must be boolean", "invalid_is_weighted"));

        if (hasIsActive && isActive is null)
            return BadRequest(Error("is_active must be boolean", "invalid_is_active"));

        var product = await One(
            $"""
            INSERT INTO products (
              name, category, unit, price_per_unit, company_price, is_weighted, is_active
            )
            VALUES ($1, $2::product_category, $3::product_unit, $4, $5, $6, $7)
            RETURNING {ProductJson}
            """,
            ct,
            name,
            category,
            unit,
            pricePerUnit,
            companyPrice,
            isWeighted.Value,
            isActive!.Value);

        return StatusCode(StatusCodes.Status201Created, new JsonObject { ["product"] = product });
    }

    [HttpPost("api/products/link-store")]
    public async Task<IActionResult> LinkProduct([FromBody] JsonObject body, CancellationToken ct)
    {
        var storeIdText = Text(body, "store_id");
        var productIdText = Text(body, "product_id");
        var hasQuantity = TryNumber(body, "quantity", out var quantityValue, out var quantityFinite);
        var hasSelling = TryNumber(body, "selling_price", out var sellingPrice, out var sellingFinite);

        if (string.IsNullOrEmpty(storeIdText) || string.IsNullOrEmpty(productIdText) || !hasQuantity)
            return BadRequest(Error("store_id, product_id and quantity are required", "inventory_required_fields"));

        if (!quantityFinite || quantityValue < 0)
            return BadRequest(Error("quantity must be greater than or equal to 0", "invalid_quantity"));

        if (hasSelling && (!sellingFinite || sellingPrice < 0))
            return BadRequest(Error("selling_price must be greater than or equal to 0", "invalid_selling_price"));

        var stockQuantity = (int)Math.Ceiling(quantityValue);
        var status = quantityValue <= 0 ? "out_of_stock" : quantityValue <= 2 ? "low_stock" : "available";

        if (!Guid.TryParse(storeIdText, out var storeId) || !Guid.TryParse(productIdText, out var productId))
            return BadRequest(Error("Invalid UUID value", "invalid_uuid"));

        try
        {
            var row = await One(
                """
                INSERT INTO store_inventory (
                  store_id, product_id, quantity, stock_quantity, selling_price, is_visible, status, last_delivery_date
                )
                VALUES ($1, $2, $3, $4, $5, TRUE, $6::inventory_status, CURRENT_DATE)
                ON CONFLICT (store_id, product_id)
                DO UPDATE SET
                  quantity = EXCLUDED.quantity,
                  stock_quantity = EXCLUDED.stock_quantity,
                  selling_price = EXCLUDED.selling_price,
                  is_visible = TRUE,
                  status = EXCLUDED.status,
                  last_delivery_date = CURRENT_DATE,
                  updated_at = NOW()
                RETURNING json_build_object(
                  '__created', (xmax = 0),
                  'id', id,
                  'store_id', store_id,
                  'product_id', product_id,
                  'quantity', quantity::text,
                  'stock_quantity', stock_quantity,
                  'selling_price', selling_price::text,
                  'is_visible', is_visible,
                  'status', status,
                  'last_delivery_date', CASE WHEN last_delivery_date IS NULL THEN NULL ELSE to_char(last_delivery_date::timestamp - interval '5 hours','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
                  'created_at', to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                  'updated_at', to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                )::text
                """,
                ct,
                storeId,
                productId,
                quantityValue,
                stockQuantity,
                hasSelling ? sellingPrice : null,
                status);

            var created = row["__created"]!.GetValue<bool>();
            row.Remove("__created");
            return StatusCode(created ? StatusCodes.Status201Created : StatusCodes.Status200OK, new JsonObject { ["inventory"] = row });
        }
        catch (PostgresException e) when (e.SqlState == "23503")
        {
            return BadRequest(Error("Store or product was not found", "store_or_product_not_found"));
        }
        catch (PostgresException e) when (e.SqlState == "22P02")
        {
            return BadRequest(Error("Invalid UUID value", "invalid_uuid"));
        }
    }

    [HttpGet("api/promocodes")]
    public async Task<JsonObject> ListPromocodes([FromQuery(Name = "store_id")] string? storeId, CancellationToken ct)
    {
        string sql;
        object?[] values;
        if (string.IsNullOrEmpty(storeId))
        {
            sql = $"SELECT COALESCE(json_agg({PromoJson}::json ORDER BY created_at DESC), '[]'::json)::text FROM promo_codes";
            values = [];
        }
        else
        {
            sql = $"SELECT COALESCE(json_agg({PromoJson}::json ORDER BY created_at DESC), '[]'::json)::text FROM promo_codes WHERE store_id = $1";
            values = [Guid.Parse(storeId)];
        }

        return new JsonObject { ["promo_codes"] = await Array(sql, ct, values) };
    }

    [HttpPost("api/promocodes")]
    public async Task<IActionResult> CreatePromocode([FromBody] JsonObject body, CancellationToken ct)
    {
        var code = (Text(body, "code") ?? string.Empty).Trim().ToUpperInvariant();
        var discountType = Text(body, "discount_type");
        var hasDiscount = TryNumber(body, "discount_value", out var discountValue, out var discountFinite);
        var hasMin = TryNumber(body, "min_order_value", out var minOrderValue, out var minFinite);
        var min = body.ContainsKey("min_order_value") && body["min_order_value"]!.GetValueKind() != JsonValueKind.Null
            ? minOrderValue
            : 0m;
        var minOk = !body.ContainsKey("min_order_value")
            || body["min_order_value"]!.GetValueKind() == JsonValueKind.Null
            || (hasMin && minFinite);
        var usage = body.ContainsKey("usage_per_customer") && body["usage_per_customer"]!.GetValueKind() != JsonValueKind.Null
            ? Int(body, "usage_per_customer")
            : 1;
        var hasMaxUses = body.ContainsKey("max_uses");
        var maxUsesIsNull = hasMaxUses && body["max_uses"]!.GetValueKind() == JsonValueKind.Null;
        var maxUses = !hasMaxUses || maxUsesIsNull ? null : Int(body, "max_uses");
        var hasIsActive = body.ContainsKey("is_active");
        var isActive = hasIsActive ? Bool(body, "is_active") : true;

        if (string.IsNullOrEmpty(code))
            return BadRequest(Error("code is required", "promo_code_required"));

        if (discountType is not ("fixed_amount" or "percentage"))
            return BadRequest(Error("discount_type must be fixed_amount or percentage", "invalid_discount_type"));

        if (!hasDiscount || !discountFinite || discountValue <= 0)
            return BadRequest(Error("discount_value must be greater than 0", "invalid_discount_value"));

        if (!minOk || min < 0)
            return BadRequest(Error("min_order_value must be greater than or equal to 0", "invalid_min_order_value"));

        if (usage is null || usage <= 0)
            return BadRequest(Error("usage_per_customer must be a positive integer", "invalid_usage_per_customer"));

        if (hasMaxUses && !maxUsesIsNull && (maxUses is null || maxUses < 0))
            return BadRequest(Error("max_uses must be null or a non-negative integer", "invalid_max_uses"));

        if (hasIsActive && isActive is null)
            return BadRequest(Error("is_active must be boolean", "invalid_is_active"));

        Guid? storeId = null;
        if (body.ContainsKey("store_id") && body["store_id"]!.GetValueKind() != JsonValueKind.Null)
        {
            var storeText = Text(body, "store_id");
            if (string.IsNullOrEmpty(storeText) || !Guid.TryParse(storeText, out var parsed))
                return BadRequest(Error("Invalid store_id", "invalid_store_id"));
            storeId = parsed;
        }

        try
        {
            var promo = await One(
                $"""
                INSERT INTO promo_codes (
                  store_id, code, discount_type, discount_value, min_order_value,
                  max_uses, usage_per_customer, valid_from, valid_until, is_active
                )
                VALUES ($1, upper($2), $3::discount_type, $4, $5, $6, $7, $8, $9, $10)
                RETURNING {PromoJson}
                """,
                ct,
                storeId,
                code,
                discountType,
                discountValue,
                min,
                maxUses,
                usage.Value,
                NullText(body, "valid_from"),
                NullText(body, "valid_until"),
                isActive!.Value);

            return StatusCode(StatusCodes.Status201Created, new JsonObject { ["promo_code"] = promo });
        }
        catch (PostgresException e) when (e.SqlState == "23505")
        {
            return Conflict(Error("Promo code already exists", "promo_code_already_exists"));
        }
        catch (PostgresException e) when (e.SqlState is "23503" or "22P02")
        {
            return BadRequest(Error("Invalid store_id", "invalid_store_id"));
        }
    }

    private async Task<JsonObject> One(string sql, CancellationToken ct, params object?[] values)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var value in values)
            command.Parameters.AddWithValue(value ?? DBNull.Value);
        return JsonNode.Parse((string)(await command.ExecuteScalarAsync(ct))!)!.AsObject();
    }

    private async Task<JsonArray> Array(string sql, CancellationToken ct, params object?[] values)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var value in values)
            command.Parameters.AddWithValue(value ?? DBNull.Value);
        return JsonNode.Parse((string)(await command.ExecuteScalarAsync(ct))!)!.AsArray();
    }

    private static JsonObject Error(string message, string code) => new() { ["message"] = message, ["code"] = code };

    private static string? Text(JsonObject body, string key)
    {
        if (!body.ContainsKey(key) || body[key] is null || body[key]!.GetValueKind() == JsonValueKind.Null)
            return null;
        return body[key]!.GetValueKind() == JsonValueKind.String
            ? body[key]!.GetValue<string>()
            : body[key]!.ToJsonString().Trim('"');
    }

    private static string? NullText(JsonObject body, string key)
    {
        if (!body.ContainsKey(key) || body[key] is null || body[key]!.GetValueKind() == JsonValueKind.Null)
            return null;
        return Text(body, key);
    }

    /// <summary>Node toNumber: undefined/null/'' => missing; otherwise Number(value) which may be non-finite.</summary>
    private static bool TryNumber(JsonObject body, string key, out decimal value, out bool finite)
    {
        value = 0;
        finite = false;
        if (!body.ContainsKey(key) || body[key] is null)
            return false;
        var kind = body[key]!.GetValueKind();
        if (kind == JsonValueKind.Null)
            return false;
        if (kind == JsonValueKind.String && body[key]!.GetValue<string>() == string.Empty)
            return false;
        if (kind == JsonValueKind.Number && body[key]!.AsValue().TryGetValue(out value))
        {
            finite = true;
            return true;
        }
        if (kind == JsonValueKind.String
            && decimal.TryParse(body[key]!.GetValue<string>(), NumberStyles.Number, CultureInfo.InvariantCulture, out value))
        {
            finite = true;
            return true;
        }
        // Present but NaN-like (e.g. "abc") — Node treats as defined non-finite.
        finite = false;
        return true;
    }

    private static int? Int(JsonObject body, string key)
    {
        if (!body.ContainsKey(key) || body[key] is null || body[key]!.GetValueKind() == JsonValueKind.Null)
            return null;
        if (body[key]!.GetValueKind() == JsonValueKind.Number)
        {
            var number = body[key]!.GetValue<decimal>();
            if (number != decimal.Truncate(number))
                return null;
            return (int)number;
        }
        if (body[key]!.GetValueKind() == JsonValueKind.String
            && decimal.TryParse(body[key]!.GetValue<string>(), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)
            && parsed == decimal.Truncate(parsed))
            return (int)parsed;
        return null;
    }

    private static bool? Bool(JsonObject body, string key)
    {
        if (!body.ContainsKey(key) || body[key] is null || body[key]!.GetValueKind() == JsonValueKind.Null)
            return null;
        if (body[key]!.GetValueKind() is JsonValueKind.True or JsonValueKind.False)
            return body[key]!.GetValue<bool>();
        return null;
    }
}
