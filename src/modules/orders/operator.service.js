import { AppError } from '../../utils/errors.js';
import {
  createOrderStatusHistory,
  findOperatorOrders,
  findOrderForUpdate,
  updateOrderActualWeightAndTotals,
  updateOrderDeliveryStatus,
  updateOrderItemActualWeight,
  withOperatorTransaction,
} from './operator.repository.js';

const deliveryStatuses = ['new', 'picked', 'in_delivery', 'delivered', 'failed'];
const paymentStatuses = ['pending', 'online_paid', 'fully_paid', 'cancelled'];
const allowedDeliveryTransitions = new Map([
  ['new', ['picked', 'failed']],
  ['picked', ['in_delivery', 'failed']],
  ['in_delivery', ['delivered', 'failed']],
  ['delivered', []],
  ['failed', []],
]);

const roundMoney = (value) => {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
};

const getOperatorStoreId = (user) => {
  return user?.store_id;
};

const assertOperatorStore = (user) => {
  const operatorStoreId = getOperatorStoreId(user);

  if (!operatorStoreId) {
    throw new AppError(403, 'Operator must be assigned to a store', 'operator_store_required');
  }

  return operatorStoreId;
};

const assertOrderBelongsToOperator = (order, operatorStoreId) => {
  if (!order) {
    throw new AppError(404, 'Order was not found', 'order_not_found');
  }

  if (String(order.store_id) !== String(operatorStoreId)) {
    throw new AppError(
      403,
      'Operator can only manage orders from their assigned store',
      'operator_store_mismatch',
    );
  }
};

const normalizeDeliveryStatus = (status) => {
  if (!status) {
    return undefined;
  }

  if (!deliveryStatuses.includes(status)) {
    throw new AppError(400, 'Invalid delivery_status', 'invalid_delivery_status');
  }

  return status;
};

const normalizePaymentStatus = (status) => {
  if (!status) {
    return undefined;
  }

  if (!paymentStatuses.includes(status)) {
    throw new AppError(400, 'Invalid payment_status', 'invalid_payment_status');
  }

  return status;
};

const assertDeliveryTransitionAllowed = (oldStatus, newStatus) => {
  const allowedNextStatuses = allowedDeliveryTransitions.get(oldStatus) || [];

  if (!allowedNextStatuses.includes(newStatus)) {
    throw new AppError(
      400,
      `Delivery status transition ${oldStatus} -> ${newStatus} is not allowed`,
      'invalid_delivery_status_transition',
    );
  }
};

export const getOperatorOrders = async ({
  user,
  delivery_date,
  delivery_status,
  payment_status,
  status,
}) => {
  const operatorStoreId = assertOperatorStore(user);
  const normalizedDeliveryStatus = normalizeDeliveryStatus(delivery_status || status);
  const normalizedPaymentStatus = normalizePaymentStatus(payment_status);

  const orders = await findOperatorOrders({
    storeId: operatorStoreId,
    deliveryDate: delivery_date,
    deliveryStatus: normalizedDeliveryStatus,
    paymentStatus: normalizedPaymentStatus,
  });

  return { orders };
};

export const updateDeliveryStatus = async ({ user, orderId, deliveryStatus }) => {
  const operatorStoreId = assertOperatorStore(user);
  const normalizedDeliveryStatus = normalizeDeliveryStatus(deliveryStatus);

  return withOperatorTransaction(async (client) => {
    const order = await findOrderForUpdate(client, orderId);
    assertOrderBelongsToOperator(order, operatorStoreId);

    assertDeliveryTransitionAllowed(order.delivery_status, normalizedDeliveryStatus);

    const updatedOrder = await updateOrderDeliveryStatus({
      client,
      orderId: order.id,
      deliveryStatus: normalizedDeliveryStatus,
    });

    await createOrderStatusHistory({
      client,
      orderId: order.id,
      oldStatus: order.delivery_status,
      newStatus: normalizedDeliveryStatus,
      changedBy: user.id,
    });

    return {
      message: 'Order delivery_status updated successfully',
      order: updatedOrder,
    };
  });
};

export const pickOrder = async ({ user, orderId, items }) => {
  const operatorStoreId = assertOperatorStore(user);

  return withOperatorTransaction(async (client) => {
    const order = await findOrderForUpdate(client, orderId);
    assertOrderBelongsToOperator(order, operatorStoreId);

    if (Array.isArray(items)) {
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
    }

    assertDeliveryTransitionAllowed(order.delivery_status, 'picked');

    const pickedOrder = await updateOrderDeliveryStatus({
      client,
      orderId: order.id,
      deliveryStatus: 'picked',
    });

    await createOrderStatusHistory({
      client,
      orderId: order.id,
      oldStatus: order.delivery_status,
      newStatus: 'picked',
      changedBy: user.id,
    });

    return {
      message: 'Order picked successfully',
      order: pickedOrder,
    };
  });
};

export const recordActualWeight = async ({ user, orderId, actualWeight }) => {
  const operatorStoreId = assertOperatorStore(user);
  const parsedActualWeight = Number(actualWeight);

  if (!Number.isFinite(parsedActualWeight) || parsedActualWeight <= 0) {
    throw new AppError(400, 'actual_weight must be a positive number', 'invalid_actual_weight');
  }

  return withOperatorTransaction(async (client) => {
    const order = await findOrderForUpdate(client, orderId);
    assertOrderBelongsToOperator(order, operatorStoreId);

    const estimatedWeight = Number(order.estimated_weight);
    const subtotal = Number(order.subtotal ?? order.total_price);
    const onlinePaymentAmount = Number(order.online_payment_amount || 0);

    if (!Number.isFinite(estimatedWeight) || estimatedWeight <= 0) {
      throw new AppError(
        400,
        'order.estimated_weight must be greater than 0 before recording actual_weight',
        'invalid_order_estimated_weight',
      );
    }

    if (!Number.isFinite(subtotal) || subtotal < 0) {
      throw new AppError(400, 'Order subtotal is invalid', 'invalid_order_subtotal');
    }

    const finalTotal = roundMoney(subtotal * (parsedActualWeight / estimatedWeight));
    const posTerminalTopup = roundMoney(Math.max(0, finalTotal - onlinePaymentAmount));

    const updatedOrder = await updateOrderActualWeightAndTotals({
      client,
      orderId: order.id,
      actualWeight: parsedActualWeight,
      finalTotal,
      posTerminalTopup,
    });

    return {
      message: 'Order actual_weight recorded successfully',
      order: updatedOrder,
    };
  });
};
