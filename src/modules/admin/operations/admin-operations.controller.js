import * as service from './admin-operations.service.js';

const handle = (action) => async (request, response, next) => {
  try {
    return response.status(200).json(await action(request));
  } catch (error) {
    return next(error);
  }
};

export const getOrders = handle((request) => service.listOrders({ query: request.query }));
export const getOrder = handle((request) => service.getOrder({ id: request.params.id }));
export const updateOrderStatus = handle((request) => service.updateOrderStatus({
  user: request.user,
  id: request.params.id,
  body: request.body || {},
}));
export const getPayments = handle((request) => service.listPayments({ query: request.query }));
export const getRevenueAnalytics = handle((request) => service.getRevenueAnalytics({ query: request.query }));
export const getDeliveryAnalytics = handle((request) => service.getDeliveryAnalytics({ query: request.query }));
export const getStoreReport = handle((request) => service.getStoreReport({
  storeId: request.params.id,
  query: request.query,
}));
export const exportOrders = handle((request) => service.exportOrders({ query: request.query }));
export const getPromoCodeUsage = handle((request) => service.getPromoCodeUsage({ promoCodeId: request.params.id }));
export const getFirstOrderDiscounts = handle(() => service.listFirstOrderDiscounts());
