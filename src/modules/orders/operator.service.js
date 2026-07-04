import { AppError } from '../../utils/errors.js';
import {
  findOperatorOrders,
  findOrderForUpdate,
  findOrderItemsForPricing,
  markOrderPicked,
  updateOrderItemActualWeight,
  withOperatorTransaction,
} from './operator.repository.js';

const allowedOrderStatuses = ['new', 'picked', 'in_delivery', 'delivered', 'canceled'];
const onlinePaymentDiscountRate = 0.05;

const roundMoney = (value) => {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
};

const getOperatorStoreId = (user) => {
  return user?.store_id;
};

export const getOperatorOrders = async ({ user, status }) => {
  const operatorStoreId = getOperatorStoreId(user);

  if (!operatorStoreId) {
    throw new AppError(403, 'Operator must be assigned to a store', 'operator_store_required');
  }

  if (status && !allowedOrderStatuses.includes(status)) {
    throw new AppError(400, 'Invalid order status filter', 'invalid_order_status');
  }

  const orders = await findOperatorOrders({
    storeId: operatorStoreId,
    status,
  });

  return { orders };
};

export const pickOrder = async ({ user, orderId, items }) => {
  const operatorStoreId = getOperatorStoreId(user);

  if (!operatorStoreId) {
    throw new AppError(403, 'Operator must be assigned to a store', 'operator_store_required');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError(400, 'Picked order items are required', 'picked_items_required');
  }

  return withOperatorTransaction(async (client) => {
    const order = await findOrderForUpdate(client, orderId);

    if (!order) {
      throw new AppError(404, 'Order was not found', 'order_not_found');
    }

    if (order.store_id !== operatorStoreId) {
      throw new AppError(
        403,
        'Operator can only manage orders from their assigned store',
        'operator_store_mismatch',
      );
    }

    for (const item of items) {
      const { item_id, actual_weight } = item;
      const parsedActualWeight = Number(actual_weight);

      if (!item_id || !Number.isFinite(parsedActualWeight) || parsedActualWeight <= 0) {
        throw new AppError(
          400,
          'Each picked item must include item_id and a positive actual_weight',
          'invalid_picked_item',
        );
      }

      const updatedItem = await updateOrderItemActualWeight({
        client,
        orderId: order.id,
        itemId: item_id,
        actualWeight: parsedActualWeight,
      });

      if (!updatedItem) {
        throw new AppError(
          404,
          `Order item ${item_id} was not found in this order`,
          'order_item_not_found',
        );
      }
    }

    const orderItems = await findOrderItemsForPricing(client, order.id);
    let recalculatedTotalPrice = 0;

    for (const orderItem of orderItems) {
      const pricePerUnit = Number(orderItem.price_per_unit);

      if (orderItem.is_weighted) {
        if (!orderItem.actual_weight) {
          throw new AppError(
            400,
            `Weighted order item ${orderItem.id} requires actual_weight before picking`,
            'weighted_item_actual_weight_required',
          );
        }

        recalculatedTotalPrice += Number(orderItem.actual_weight) * pricePerUnit;
      } else {
        recalculatedTotalPrice += Number(orderItem.quantity) * pricePerUnit;
      }
    }

    if (order.payment_method === 'online') {
      recalculatedTotalPrice -= recalculatedTotalPrice * onlinePaymentDiscountRate;
    }

    const finalTotalPrice = roundMoney(recalculatedTotalPrice);
    const pickedOrder = await markOrderPicked({
      client,
      orderId: order.id,
      totalPrice: finalTotalPrice,
    });

    return {
      message: 'Order picked successfully',
      order: pickedOrder,
      items: orderItems,
    };
  });
};
