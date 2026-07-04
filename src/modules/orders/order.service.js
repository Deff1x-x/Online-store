import { AppError } from '../../utils/errors.js';
import {
  createOrderItem,
  createOrderRecord,
  findActiveSubscription,
  findAvailableStoreProduct,
  findCustomerById,
  withOrderTransaction,
} from './order.repository.js';

const onlinePaymentDiscountRate = 0.05;

const roundMoney = (value) => {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
};

export const createOrder = async ({ user, payment_method, items }) => {
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

  return withOrderTransaction(async (client) => {
    const customer = await findCustomerById(client, customerId);

    if (!customer) {
      throw new AppError(403, 'Only customers can create orders', 'customer_required');
    }

    const subscription = await findActiveSubscription(client, customer.id, customer.store_id);

    if (!subscription) {
      throw new AppError(403, 'Active subscription is required to create an order', 'active_subscription_required');
    }

    const orderItems = [];
    let totalPrice = 0;

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

      if (!product.is_visible || product.stock_quantity < parsedQuantity) {
        throw new AppError(
          400,
          `Product ${product_id} is not visible or does not have enough stock`,
          'product_not_visible_or_insufficient_stock',
        );
      }

      const pricePerUnit = Number(product.price_per_unit);
      let estimatedWeight = null;
      let itemTotalPrice = 0;

      if (product.is_weighted) {
        if (!product.average_weight) {
          throw new AppError(
            400,
            `Weighted product ${product_id} does not have average_weight configured`,
            'weighted_product_missing_average_weight',
          );
        }

        estimatedWeight = Number(product.average_weight) * parsedQuantity;
        itemTotalPrice = estimatedWeight * pricePerUnit;
      } else {
        itemTotalPrice = parsedQuantity * pricePerUnit;
      }

      totalPrice += itemTotalPrice;

      orderItems.push({
        product_id,
        quantity: parsedQuantity,
        estimated_weight: estimatedWeight,
        price_per_unit: pricePerUnit,
      });
    }

    if (payment_method === 'online') {
      totalPrice -= totalPrice * onlinePaymentDiscountRate;
    }

    const finalTotalPrice = roundMoney(totalPrice);

    const order = await createOrderRecord({
      client,
      storeId: customer.store_id,
      customerId: customer.id,
      paymentMethod: payment_method,
      totalPrice: finalTotalPrice,
    });

    for (const orderItem of orderItems) {
      await createOrderItem({
        client,
        orderId: order.id,
        productId: orderItem.product_id,
        quantity: orderItem.quantity,
        estimatedWeight: orderItem.estimated_weight,
        pricePerUnit: orderItem.price_per_unit,
      });
    }

    return {
      message: 'Order created successfully',
      order: {
        ...order,
        items: orderItems,
      },
    };
  });
};
