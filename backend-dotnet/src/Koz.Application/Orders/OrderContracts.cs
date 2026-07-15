using System.Text.Json;
using System.Text.Json.Serialization;

namespace Koz.Application.Orders;

public sealed record CreateOrderRequest(
    [property: JsonPropertyName("payment_method")] string? PaymentMethod,
    [property: JsonPropertyName("delivery_address_id")] string? DeliveryAddressId,
    IReadOnlyList<CreateOrderItemRequest>? Items,
    [property: JsonPropertyName("promo_code")] string? PromoCode);

public sealed record CreateOrderItemRequest(
    [property: JsonPropertyName("product_id")] string? ProductId,
    JsonElement Quantity);

public sealed record OrderCreateResponse(
    [property: JsonPropertyName("order_id")] string OrderId,
    [property: JsonPropertyName("order_number")] string? OrderNumber,
    OrderBreakdown Breakdown,
    [property: JsonPropertyName("payment_options")] OrderPaymentOptions PaymentOptions,
    OrderDto Order);

public sealed record OrderBreakdown(
    [property: JsonConverter(typeof(NodeMoneyJsonConverter))] decimal Subtotal,
    [property: JsonPropertyName("first_order_discount"), JsonConverter(typeof(NodeMoneyJsonConverter))] decimal FirstOrderDiscount,
    [property: JsonPropertyName("promo_discount"), JsonConverter(typeof(NodeMoneyJsonConverter))] decimal PromoDiscount,
    [property: JsonPropertyName("discount_total"), JsonConverter(typeof(NodeMoneyJsonConverter))] decimal DiscountTotal,
    [property: JsonPropertyName("delivery_fee"), JsonConverter(typeof(NodeMoneyJsonConverter))] decimal DeliveryFee,
    [property: JsonPropertyName("final_total"), JsonConverter(typeof(NodeMoneyJsonConverter))] decimal FinalTotal);

public sealed record OrderPaymentOptions(OrderOnlinePaymentOption Online, OrderPosPaymentOption Pos);
public sealed record OrderOnlinePaymentOption([property: JsonPropertyName("preauth_amount"), JsonConverter(typeof(NodeMoneyJsonConverter))] decimal PreauthAmount, [property: JsonPropertyName("remainder_on_delivery"), JsonConverter(typeof(NodeMoneyJsonConverter))] decimal RemainderOnDelivery, string Note);
public sealed record OrderPosPaymentOption([property: JsonConverter(typeof(NodeMoneyJsonConverter))] decimal Amount);

public sealed record OrderDto(
    string Id,
    [property: JsonPropertyName("order_number")] string? OrderNumber,
    [property: JsonPropertyName("store_id")] string StoreId,
    [property: JsonPropertyName("customer_id")] string CustomerId,
    [property: JsonPropertyName("delivery_address_id")] string? DeliveryAddressId,
    string Subtotal,
    [property: JsonPropertyName("discount_total")] string DiscountTotal,
    [property: JsonPropertyName("delivery_fee")] string DeliveryFee,
    [property: JsonPropertyName("estimated_weight")] string? EstimatedWeight,
    [property: JsonPropertyName("actual_weight")] string? ActualWeight,
    [property: JsonPropertyName("online_payment_amount")] string OnlinePaymentAmount,
    [property: JsonPropertyName("online_capture_amount")] string OnlineCaptureAmount,
    [property: JsonPropertyName("pos_terminal_topup")] string PosTerminalTopup,
    [property: JsonPropertyName("final_total")] string FinalTotal,
    [property: JsonPropertyName("total_price")] string TotalPrice,
    [property: JsonPropertyName("fulfillment_window")] string FulfillmentWindow,
    [property: JsonPropertyName("delivery_date")] string? DeliveryDate,
    [property: JsonPropertyName("delivery_time_slot")] string? DeliveryTimeSlot,
    [property: JsonPropertyName("delivery_status")] string DeliveryStatus,
    [property: JsonPropertyName("payment_status")] string PaymentStatus,
    [property: JsonPropertyName("delivered_at")] string? DeliveredAt,
    [property: JsonPropertyName("created_at")] string CreatedAt,
    [property: JsonPropertyName("updated_at")] string UpdatedAt,
    IReadOnlyList<OrderItemDto> Items);

public sealed record OrderItemDto(
    string Id,
    [property: JsonPropertyName("order_id")] string OrderId,
    [property: JsonPropertyName("product_id")] string ProductId,
    string Quantity,
    [property: JsonPropertyName("price_per_unit")] string PricePerUnit,
    [property: JsonPropertyName("line_total")] string LineTotal,
    [property: JsonPropertyName("estimated_weight")] string? EstimatedWeight,
    [property: JsonPropertyName("created_at")] string CreatedAt,
    [property: JsonPropertyName("updated_at")] string UpdatedAt);

public sealed class OrderContractException(int statusCode, string message, string code) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public string Code { get; } = code;
}

// These contracts deliberately mirror the two mounted Node my-orders queries.
// List is a projection; detail is SELECT orders.* plus the differently shaped item projection.
public sealed record MyOrdersResponse(IReadOnlyList<CustomerOrderListDto> Orders);
public sealed record MyOrderResponse(CustomerOrderDetailDto Order);
public sealed record CustomerOrderListDto(
    string Id,
    [property: JsonPropertyName("order_number")] string? OrderNumber,
    string Subtotal,
    [property: JsonPropertyName("discount_total")] string DiscountTotal,
    [property: JsonPropertyName("delivery_fee")] string DeliveryFee,
    [property: JsonPropertyName("online_payment_amount")] string OnlinePaymentAmount,
    [property: JsonPropertyName("online_capture_amount")] string OnlineCaptureAmount,
    [property: JsonPropertyName("pos_terminal_topup")] string PosTerminalTopup,
    [property: JsonPropertyName("final_total")] string FinalTotal,
    string Status,
    [property: JsonPropertyName("delivery_status")] string DeliveryStatus,
    [property: JsonPropertyName("payment_status")] string PaymentStatus,
    [property: JsonPropertyName("fulfillment_window")] string FulfillmentWindow,
    [property: JsonPropertyName("delivery_date")] string? DeliveryDate,
    [property: JsonPropertyName("created_at")] string CreatedAt);
public sealed record CustomerOrderDetailDto(
    string Id,
    [property: JsonPropertyName("order_number")] string? OrderNumber,
    [property: JsonPropertyName("store_id")] string StoreId,
    [property: JsonPropertyName("customer_id")] string CustomerId,
    [property: JsonPropertyName("delivery_address_id")] string? DeliveryAddressId,
    string Subtotal,
    [property: JsonPropertyName("discount_total")] string DiscountTotal,
    [property: JsonPropertyName("delivery_fee")] string DeliveryFee,
    [property: JsonPropertyName("estimated_weight")] string? EstimatedWeight,
    [property: JsonPropertyName("actual_weight")] string? ActualWeight,
    [property: JsonPropertyName("online_payment_amount")] string OnlinePaymentAmount,
    [property: JsonPropertyName("online_capture_amount")] string OnlineCaptureAmount,
    [property: JsonPropertyName("pos_terminal_topup")] string PosTerminalTopup,
    [property: JsonPropertyName("final_total")] string FinalTotal,
    [property: JsonPropertyName("total_price")] string TotalPrice,
    [property: JsonPropertyName("fulfillment_window")] string FulfillmentWindow,
    [property: JsonPropertyName("delivery_date")] string? DeliveryDate,
    [property: JsonPropertyName("delivery_time_slot")] string? DeliveryTimeSlot,
    [property: JsonPropertyName("delivery_status")] string DeliveryStatus,
    [property: JsonPropertyName("payment_status")] string PaymentStatus,
    [property: JsonPropertyName("delivered_at")] string? DeliveredAt,
    [property: JsonPropertyName("created_at")] string CreatedAt,
    [property: JsonPropertyName("updated_at")] string UpdatedAt,
    IReadOnlyList<CustomerOrderItemDetailDto> Items);
public sealed record CustomerOrderItemDetailDto(
    [property: JsonPropertyName("product_id")] string ProductId,
    string Name,
    string Quantity,
    [property: JsonPropertyName("price_per_unit")] string PricePerUnit,
    [property: JsonPropertyName("line_total")] string LineTotal,
    [property: JsonPropertyName("estimated_weight")] string? EstimatedWeight);

public sealed record ManagerOrderStatusRequest([property: JsonPropertyName("delivery_status")] string? DeliveryStatus);
public sealed record ManagerActualWeightRequest([property: JsonPropertyName("actual_weight")] JsonElement ActualWeight);
public sealed record ManagerOrdersResponse(IReadOnlyList<ManagerOrderDto> Orders);
public sealed record ManagerOrderResponse(ManagerOrderDto Order);
public sealed record ManagerOrderDto(
    string Id, [property: JsonPropertyName("order_number")] string? OrderNumber, [property: JsonPropertyName("store_id")] string StoreId,
    [property: JsonPropertyName("customer_id")] string CustomerId, [property: JsonPropertyName("delivery_address_id")] string? DeliveryAddressId,
    string Subtotal, [property: JsonPropertyName("discount_total")] string DiscountTotal, [property: JsonPropertyName("delivery_fee")] string DeliveryFee,
    [property: JsonPropertyName("estimated_weight")] string? EstimatedWeight, [property: JsonPropertyName("actual_weight")] string? ActualWeight,
    [property: JsonPropertyName("online_payment_amount")] string OnlinePaymentAmount, [property: JsonPropertyName("online_capture_amount")] string OnlineCaptureAmount,
    [property: JsonPropertyName("pos_terminal_topup")] string PosTerminalTopup, [property: JsonPropertyName("final_total")] string FinalTotal,
    [property: JsonPropertyName("total_price")] string TotalPrice, [property: JsonPropertyName("fulfillment_window")] string FulfillmentWindow,
    [property: JsonPropertyName("delivery_date")] string? DeliveryDate, [property: JsonPropertyName("delivery_time_slot")] string? DeliveryTimeSlot,
    [property: JsonPropertyName("delivery_status")] string DeliveryStatus, [property: JsonPropertyName("payment_status")] string PaymentStatus,
    [property: JsonPropertyName("delivered_at")] string? DeliveredAt, [property: JsonPropertyName("created_at")] string CreatedAt,
    [property: JsonPropertyName("updated_at")] string UpdatedAt, [property: JsonPropertyName("delivery_address"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ManagerDeliveryAddress? DeliveryAddress,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<ManagerOrderItem>? Items);
public sealed record ManagerDeliveryAddress(string? Id, string? Floor, string? Entrance, string? Apartment, [property: JsonPropertyName("entrance_code")] string? EntranceCode, [property: JsonPropertyName("coverage_address")] string? CoverageAddress);
public sealed record ManagerOrderItem(string Name, [property: JsonConverter(typeof(NodeNumericJsonConverter))] decimal Quantity, [property: JsonPropertyName("line_total"), JsonConverter(typeof(NodeNumericJsonConverter))] decimal LineTotal, [property: JsonPropertyName("product_id")] string ProductId, [property: JsonPropertyName("price_per_unit"), JsonConverter(typeof(NodeNumericJsonConverter))] decimal PricePerUnit, [property: JsonPropertyName("estimated_weight"), JsonConverter(typeof(NodeNumericJsonConverter))] decimal? EstimatedWeight);
public sealed class ManagerOrderContractException(int statusCode, string message, string code) : Exception(message) { public int StatusCode { get; } = statusCode; public string Code { get; } = code; }

public sealed class NodeMoneyJsonConverter : JsonConverter<decimal>
{
    public override decimal Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) => reader.GetDecimal();
    public override void Write(Utf8JsonWriter writer, decimal value, JsonSerializerOptions options) => writer.WriteRawValue(value.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture));
}

public sealed class NodeNumericJsonConverter : JsonConverter<decimal>
{
    public override decimal Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) => reader.GetDecimal();
    public override void Write(Utf8JsonWriter writer, decimal value, JsonSerializerOptions options) => writer.WriteRawValue(value.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture));
}
