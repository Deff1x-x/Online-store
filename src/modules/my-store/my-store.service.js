import { notImplemented } from '../../utils/errors.js';
import {
  getOperatorOrders,
  pickOrder,
  recordActualWeight as recordOperatorActualWeight,
  updateDeliveryStatus,
} from '../orders/operator.service.js';

export const listStoreOrders = async ({ user, query }) => getOperatorOrders({
  user,
  delivery_date: query.delivery_date,
  delivery_status: query.delivery_status,
  payment_status: query.payment_status,
  status: query.status,
});

export const pickStoreOrder = async ({ user, orderId, items }) => pickOrder({
  user,
  orderId,
  items,
});

export const updateOrderStatus = async ({ user, params, body }) => updateDeliveryStatus({
  user,
  orderId: params.id,
  deliveryStatus: body.delivery_status || body.status,
});

export const recordActualWeight = async ({ user, params, body }) => recordOperatorActualWeight({
  user,
  orderId: params.id,
  actualWeight: body.actual_weight,
});

export const listInventory = async () => notImplemented('Store inventory');
export const updateInventory = async () => notImplemented('Store inventory update');
export const receiveInventory = async () => notImplemented('Store inventory incoming stock');
export const getAnalytics = async () => notImplemented('Store analytics');
