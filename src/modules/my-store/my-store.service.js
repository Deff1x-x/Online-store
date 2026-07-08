import { AppError } from '../../utils/AppError.js';
import { roundMoney } from '../../utils/roundMoney.js';
import {
  completeDeliveredOrder,
  findInventoryForStore,
  findOrderDetailsForStore,
  findOrderForStore,
  getAnalyticsForStore,
  insertStatusHistory,
  listInventoryForStore,
  listOrdersForStore,
  receiveInventoryForStore,
  returnOrderInventory,
  updateActualWeight,
  updateInventoryForStore,
  updateOrderDeliveryStatus,
  withTransaction,
} from './my-store.repository.js';

const allowedOrderStatuses = new Set(['new', 'picked', 'in_delivery', 'delivered', 'failed', 'cancelled']);

const transitions = Object.freeze({
  new: ['picked', 'failed', 'cancelled'],
  picked: ['in_delivery', 'failed', 'cancelled'],
  in_delivery: ['delivered', 'failed'],
  delivered: [],
  failed: [],
  cancelled: [],
});

const toNumber = (value) => Number(value);

const today = () => new Date().toISOString().slice(0, 10);

const ensureStoreScope = (user) => {
  if (!user?.store_id) {
    throw new AppError(403, 'Store operator store_id is required', 'store_scope_required');
  }

  return user.store_id;
};

const ensureTransition = (from, to) => {
  if (!allowedOrderStatuses.has(to) || !transitions[from]?.includes(to)) {
    throw new AppError(400, 'Invalid status transition', 'invalid_status_transition');
  }
};

const inventoryStatusByQuantity = (quantity) => {
  if (quantity <= 0) {
    return 'out_of_stock';
  }

  if (quantity <= 2) {
    return 'low_stock';
  }

  return 'available';
};

const hydrateOrder = async (storeId, orderId) => {
  const order = await findOrderDetailsForStore({ storeId, orderId });

  if (!order) {
    throw new AppError(404, 'Order was not found', 'order_not_found');
  }

  return order;
};

export const listStoreOrders = async ({ user, query }) => {
  const storeId = ensureStoreScope(user);
  const status = query.status;

  if (status && !allowedOrderStatuses.has(status)) {
    throw new AppError(400, 'Invalid order status filter', 'invalid_order_status');
  }

  const orders = await listOrdersForStore({ storeId, status });

  return { orders };
};

export const pickStoreOrder = async ({ user, orderId }) => {
  const storeId = ensureStoreScope(user);

  return withTransaction(async (client) => {
    const order = await findOrderForStore(client, { storeId, orderId });

    if (!order) {
      throw new AppError(404, 'Order was not found', 'order_not_found');
    }

    ensureTransition(order.delivery_status, 'picked');

    const updated = await updateOrderDeliveryStatus(client, {
      orderId,
      deliveryStatus: 'picked',
    });

    await insertStatusHistory(client, {
      orderId,
      oldStatus: order.delivery_status,
      newStatus: 'picked',
      userId: user.id,
    });

    return { order: updated };
  });
};

export const recordActualWeight = async ({ user, orderId, body }) => {
  const storeId = ensureStoreScope(user);
  const actualWeight = toNumber(body.actual_weight);

  if (!Number.isFinite(actualWeight) || actualWeight <= 0) {
    throw new AppError(400, 'actual_weight must be greater than 0', 'invalid_actual_weight');
  }

  return withTransaction(async (client) => {
    const order = await findOrderForStore(client, { storeId, orderId });

    if (!order) {
      throw new AppError(404, 'Order was not found', 'order_not_found');
    }

    if (order.delivery_status !== 'picked') {
      throw new AppError(400, 'Invalid status transition', 'invalid_status_transition');
    }

    const estimatedWeight = Number(order.estimated_weight);

    if (!Number.isFinite(estimatedWeight) || estimatedWeight <= 0) {
      throw new AppError(400, 'Order estimated_weight is invalid', 'invalid_estimated_weight');
    }

    const goodsActual = Number(order.subtotal) * (actualWeight / estimatedWeight);
    const finalTotal = roundMoney(Math.max(0, goodsActual - Number(order.discount_total)) + Number(order.delivery_fee));
    const capture = roundMoney(Math.min(Number(order.online_payment_amount), finalTotal));
    const posTopup = roundMoney(Math.max(0, finalTotal - capture));

    const updated = await updateActualWeight(client, {
      orderId,
      actualWeight,
      finalTotal,
      capture,
      posTopup,
    });

    return { order: updated };
  });
};

export const updateOrderStatus = async ({ user, orderId, body }) => {
  const storeId = ensureStoreScope(user);
  const nextStatus = body.delivery_status;

  if (!nextStatus) {
    throw new AppError(400, 'delivery_status is required', 'delivery_status_required');
  }

  return withTransaction(async (client) => {
    const order = await findOrderForStore(client, { storeId, orderId });

    if (!order) {
      throw new AppError(404, 'Order was not found', 'order_not_found');
    }

    ensureTransition(order.delivery_status, nextStatus);

    let updated = await updateOrderDeliveryStatus(client, {
      orderId,
      deliveryStatus: nextStatus,
    });

    await insertStatusHistory(client, {
      orderId,
      oldStatus: order.delivery_status,
      newStatus: nextStatus,
      userId: user.id,
    });

    if (nextStatus === 'failed' || nextStatus === 'cancelled') {
      await returnOrderInventory(client, orderId);
      updated = await findOrderForStore(client, { storeId, orderId });
    }

    if (nextStatus === 'delivered') {
      updated = await completeDeliveredOrder(client, {
        order: updated,
        userId: user.id,
      });
    }

    return { order: updated };
  });
};

export const listInventory = async ({ user }) => {
  const storeId = ensureStoreScope(user);
  const inventory = await listInventoryForStore(storeId);

  return { inventory };
};

export const updateInventory = async ({ user, productId, body }) => {
  const storeId = ensureStoreScope(user);
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, 'is_visible')) {
    if (typeof body.is_visible !== 'boolean') {
      throw new AppError(400, 'is_visible must be boolean', 'invalid_inventory_visibility');
    }

    patch.is_visible = body.is_visible;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'selling_price')) {
    const sellingPrice = body.selling_price === null ? null : toNumber(body.selling_price);

    if (sellingPrice !== null && (!Number.isFinite(sellingPrice) || sellingPrice < 0)) {
      throw new AppError(400, 'selling_price must be null or non-negative', 'invalid_selling_price');
    }

    patch.selling_price = sellingPrice;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'quantity')) {
    const quantity = toNumber(body.quantity);

    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new AppError(400, 'quantity must be greater than or equal to 0', 'invalid_inventory_quantity');
    }

    patch.quantity = quantity;
    patch.status = inventoryStatusByQuantity(quantity);
  }

  if (Object.keys(patch).length === 0) {
    throw new AppError(400, 'No inventory fields provided', 'inventory_update_required');
  }

  await withTransaction(async (client) => {
    const updated = await updateInventoryForStore(client, {
      storeId,
      productId,
      patch,
    });

    if (!updated) {
      throw new AppError(404, 'Inventory item was not found', 'inventory_not_found');
    }
  });

  const inventory = await findInventoryForStore({ storeId, productId });

  return { inventory };
};

export const receiveInventory = async ({ user, productId, body }) => {
  const storeId = ensureStoreScope(user);
  const quantity = toNumber(body.quantity);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new AppError(400, 'quantity must be greater than 0', 'invalid_inventory_quantity');
  }

  await withTransaction(async (client) => {
    const updated = await receiveInventoryForStore(client, {
      storeId,
      productId,
      quantity,
    });

    if (!updated) {
      throw new AppError(404, 'Inventory item was not found', 'inventory_not_found');
    }
  });

  const inventory = await findInventoryForStore({ storeId, productId });

  return { inventory };
};

export const getAnalytics = async ({ user, query }) => {
  const storeId = ensureStoreScope(user);
  const dateFrom = query.date_from || today();
  const dateTo = query.date_to || today();
  const analytics = await getAnalyticsForStore({
    storeId,
    dateFrom,
    dateTo,
  });

  return { analytics };
};
