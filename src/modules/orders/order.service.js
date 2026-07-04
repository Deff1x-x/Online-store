import { randomUUID } from 'crypto';
import { AppError } from '../../utils/errors.js';
import {
  createOrderItem,
  createOrderRecord,
  createCustomerRecordForUser,
  findAvailableStoreProduct,
  findCustomerById,
  findCustomerRecordForUser,
  findDeliveryAddressForOrder,
  withOrderTransaction,
} from './order.repository.js';

const onlinePaymentDiscountRate = 0.05;

const roundMoney = (value) => {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
};

const roundWeight = (value) => {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
};

const createOrderNumber = () => {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  return `ORD-${datePart}-${suffix}`;
};

export const createOrder = async ({
  user,
  payment_method,
  delivery_address_id,
  delivery_date,
  delivery_time_slot,
  items,
}) => {
  const customerId = user?.id;

  if (!customerId) {
    throw new AppError(401, 'Authenticated customer is required', 'customer_auth_required');
  }

  if (!['online', 'pos'].includes(payment_method)) {
    throw new AppError(400, 'payment_method must be either online or pos', 'invalid_payment_method');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError(400, 'Order items are required', 'order_items_required');
  }

  if (!delivery_address_id) {
    throw new AppError(400, 'delivery_address_id is required', 'delivery_address_required');
  }

  return withOrderTransaction(async (client) => {
    const customer = await findCustomerById(client, customerId);

    if (!customer) {
      throw new AppError(403, 'Only customers can create orders', 'customer_required');
    }

    let customerRecord = await findCustomerRecordForUser(client, customer);

    if (customerRecord?.user_id && String(customerRecord.user_id) !== String(customer.id)) {
      throw new AppError(403, 'Customer record is linked to another user', 'customer_record_user_mismatch');
    }

    if (!customerRecord || !customerRecord.user_id) {
      customerRecord = await createCustomerRecordForUser(client, customer);
    }

    if (customerRecord.subscription_status !== 'active') {
      throw new AppError(403, 'Active subscription is required to create an order', 'active_subscription_required');
    }

    if (String(customerRecord.store_id) !== String(customer.store_id)) {
      throw new AppError(403, 'Customer record store does not match user store', 'customer_store_mismatch');
    }

    const deliveryAddress = await findDeliveryAddressForOrder({
      client,
      addressId: delivery_address_id,
      customerRecordId: customerRecord.id,
    });

    if (!deliveryAddress) {
      throw new AppError(
        403,
        'delivery_address_id must belong to the current customer',
        'delivery_address_access_denied',
      );
    }

    if (String(deliveryAddress.store_id) !== String(customer.store_id)) {
      throw new AppError(
        403,
        'Delivery address coverage must belong to the customer store',
        'delivery_address_store_mismatch',
      );
    }

    const orderItems = [];
    let subtotal = 0;
    let estimatedWeightTotal = 0;

    for (const item of items) {
      const { product_id, quantity } = item;
      const parsedQuantity = Number(quantity);

      if (!product_id || !Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
        throw new AppError(
          400,
          'Each item must include product_id and a positive integer quantity',
          'invalid_order_item',
        );
      }

      const product = await findAvailableStoreProduct(client, product_id, customer.store_id);

      if (!product) {
        throw new AppError(
          404,
          `Product ${product_id} is not available in the customer's store`,
          'product_not_available',
        );
      }

      const availableQuantity = Math.max(
        Number(product.quantity || 0),
        Number(product.stock_quantity || 0),
      );

      if (availableQuantity < parsedQuantity) {
        throw new AppError(
          400,
          `Product ${product_id} does not have enough stock`,
          'product_insufficient_stock',
        );
      }

      const pricePerUnit = Number(product.selling_price);
      const averageWeight = product.avg_weight === null || product.avg_weight === undefined
        ? undefined
        : Number(product.avg_weight);
      let estimatedWeight = null;
      let itemTotalPrice = 0;

      if (!Number.isFinite(pricePerUnit) || pricePerUnit < 0) {
        throw new AppError(
          400,
          `Product ${product_id} does not have a valid selling_price`,
          'product_missing_selling_price',
        );
      }

      if (averageWeight !== undefined) {
        if (!Number.isFinite(averageWeight) || averageWeight <= 0) {
          throw new AppError(
            400,
            `Product ${product_id} does not have a valid avg_weight configured`,
            'product_invalid_average_weight',
          );
        }

        estimatedWeight = roundWeight(averageWeight * parsedQuantity);
      }

      if (product.is_weighted) {
        if (estimatedWeight === null) {
          throw new AppError(
            400,
            `Weighted product ${product_id} does not have avg_weight configured`,
            'weighted_product_missing_average_weight',
          );
        }

        itemTotalPrice = estimatedWeight * pricePerUnit;
      } else {
        itemTotalPrice = parsedQuantity * pricePerUnit;
      }

      const lineTotal = roundMoney(itemTotalPrice);
      subtotal += lineTotal;

      if (estimatedWeight !== null) {
        estimatedWeightTotal += estimatedWeight;
      }

      orderItems.push({
        product_id,
        inventory_id: product.inventory_id,
        quantity: parsedQuantity,
        estimated_weight: estimatedWeight,
        price_per_unit: pricePerUnit,
        unit_price: pricePerUnit,
        line_total: lineTotal,
      });
    }

    const subtotalAmount = roundMoney(subtotal);
    const estimatedWeight = estimatedWeightTotal > 0 ? roundWeight(estimatedWeightTotal) : null;
    const onlinePaymentAmount = payment_method === 'online'
      ? roundMoney(subtotalAmount * (1 - onlinePaymentDiscountRate))
      : 0;
    const finalTotal = subtotalAmount;
    const paymentStatus = 'pending';

    const order = await createOrderRecord({
      client,
      orderNumber: createOrderNumber(),
      storeId: customer.store_id,
      customerId: customer.id,
      customerRecordId: customerRecord.id,
      deliveryAddressId: deliveryAddress.id,
      paymentMethod: payment_method,
      paymentStatus,
      deliveryStatus: 'new',
      subtotal: subtotalAmount,
      estimatedWeight,
      onlinePaymentAmount,
      finalTotal,
      totalPrice: finalTotal,
      deliveryDate: delivery_date,
      deliveryTimeSlot: delivery_time_slot,
    });

    const createdItems = [];

    for (const orderItem of orderItems) {
      const createdItem = await createOrderItem({
        client,
        orderId: order.id,
        productId: orderItem.product_id,
        quantity: orderItem.quantity,
        estimatedWeight: orderItem.estimated_weight,
        pricePerUnit: orderItem.price_per_unit,
        lineTotal: orderItem.line_total,
      });

      createdItems.push({
        ...createdItem,
        inventory_id: orderItem.inventory_id,
      });
    }

    return {
      message: 'Order created successfully',
      order: {
        ...order,
        items: createdItems,
      },
    };
  });
};
