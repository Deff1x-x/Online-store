import { AppError } from '../../../utils/AppError.js';
import * as repository from './admin-operations.repository.js';

const deliveryStatuses = new Set(['new', 'picked', 'in_delivery', 'delivered', 'failed', 'cancelled']);
const allowedDeliveryTransitions = new Map([
  ['new', ['picked', 'failed', 'cancelled']],
  ['picked', ['in_delivery', 'failed', 'cancelled']],
  ['in_delivery', ['delivered', 'failed']],
  ['delivered', []],
  ['failed', []],
  ['cancelled', []],
]);

const normalizePositiveInt = (value, fallback) => {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizePagination = (query) => {
  const page = normalizePositiveInt(query.page, 1);
  const limit = Math.min(normalizePositiveInt(query.limit, 20), 100);

  return { page, limit };
};

const normalizeDeliveryStatus = (status) => {
  if (!deliveryStatuses.has(status)) {
    throw new AppError(400, 'Invalid delivery_status', 'invalid_delivery_status');
  }

  return status;
};

const assertTransitionAllowed = (currentStatus, nextStatus) => {
  const allowed = allowedDeliveryTransitions.get(currentStatus) || [];

  if (!allowed.includes(nextStatus)) {
    throw new AppError(400, 'Invalid order delivery status transition', 'invalid_status_transition');
  }
};

const requireOrder = (order) => {
  if (!order) {
    throw new AppError(404, 'Order was not found', 'order_not_found');
  }

  return order;
};

export const listOrders = async ({ query }) => {
  const { page, limit } = normalizePagination(query);
  const { orders, total } = await repository.listOrders({
    storeId: query.store_id,
    status: query.status,
    dateFrom: query.date_from,
    dateTo: query.date_to,
    page,
    limit,
  });

  return {
    orders,
    pagination: {
      page,
      limit,
      total,
    },
  };
};

export const getOrder = async ({ id }) => {
  const order = requireOrder(await repository.findOrderById(id));
  const [items, statusHistory, payments] = await Promise.all([
    repository.findOrderItems(id),
    repository.findOrderStatusHistory(id),
    repository.findOrderPayments(id),
  ]);

  return {
    order,
    items,
    status_history: statusHistory,
    payments,
  };
};

export const updateOrderStatus = async ({ user, id, body }) => {
  const deliveryStatus = normalizeDeliveryStatus(body.delivery_status);

  const order = await repository.withTransaction(async (client) => {
    const currentOrder = requireOrder(await repository.findOrderForUpdate(client, id));
    assertTransitionAllowed(currentOrder.delivery_status, deliveryStatus);

    if (deliveryStatus === 'failed' || deliveryStatus === 'cancelled') {
      await repository.returnOrderInventory(client, currentOrder.id);
    }

    let updatedOrder;

    if (deliveryStatus === 'delivered') {
      if (Number(currentOrder.pos_terminal_topup || 0) > 0) {
        await repository.insertCompletedPosPayment(client, currentOrder);
      }

      updatedOrder = await repository.markOrderDelivered(client, currentOrder.id);
    } else {
      updatedOrder = await repository.updateOrderDeliveryStatus(client, {
        orderId: currentOrder.id,
        deliveryStatus,
      });
    }

    await repository.insertOrderStatusHistory(client, {
      orderId: currentOrder.id,
      oldStatus: currentOrder.delivery_status,
      newStatus: deliveryStatus,
      changedBy: user.id,
    });

    return updatedOrder;
  });

  return { order };
};

export const listPayments = async ({ query }) => {
  const { page, limit } = normalizePagination(query);
  const { payments, total } = await repository.listPayments({
    storeId: query.store_id,
    method: query.method,
    status: query.status,
    dateFrom: query.date_from,
    dateTo: query.date_to,
    page,
    limit,
  });

  return {
    payments,
    pagination: {
      page,
      limit,
      total,
    },
  };
};

export const getRevenueAnalytics = async ({ query }) => {
  const revenue = await repository.getRevenueAnalytics({
    dateFrom: query.date_from,
    dateTo: query.date_to,
  });

  return { revenue };
};

export const getDeliveryAnalytics = async ({ query }) => {
  const delivery = await repository.getDeliveryAnalytics({
    dateFrom: query.date_from,
    dateTo: query.date_to,
  });

  return { delivery };
};

export const getStoreReport = async ({ storeId, query }) => {
  const report = await repository.getStoreReport({
    storeId,
    dateFrom: query.date_from,
    dateTo: query.date_to,
  });

  if (!report.store) {
    throw new AppError(404, 'Store was not found', 'store_not_found');
  }

  return { report };
};

export const exportOrders = async ({ query }) => {
  const rows = await repository.exportOrderRows({
    storeId: query.store_id,
    status: query.status,
    dateFrom: query.date_from,
    dateTo: query.date_to,
  });

  return {
    message: 'Orders export generated',
    format: 'rows',
    generated_at: new Date().toISOString(),
    rows,
  };
};

export const getPromoCodeUsage = async ({ promoCodeId }) => {
  const usage = await repository.listPromoCodeUsage(promoCodeId);
  return { usage };
};

export const listFirstOrderDiscounts = async () => {
  const firstOrderDiscounts = await repository.listFirstOrderDiscounts();
  return { first_order_discounts: firstOrderDiscounts };
};
