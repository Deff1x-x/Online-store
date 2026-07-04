import { sendControllerError } from '../../../utils/http.js';
import * as operationsService from './operations.service.js';

const run = (serviceCall, fallbackMessage, statusCode = 200) => async (request, response) => {
  try {
    const result = await serviceCall({ user: request.user, params: request.params, query: request.query, body: request.body });
    return response.status(statusCode).json(result);
  } catch (error) {
    return sendControllerError(response, error, fallbackMessage);
  }
};

export const listOrders = run(operationsService.listOrders, 'Failed to fetch admin operations orders');
export const getOrder = run(operationsService.getOrder, 'Failed to fetch admin operations order');
export const updateOrderStatus = run(operationsService.updateOrderStatus, 'Failed to update admin operations order status');
export const listPayments = run(operationsService.listPayments, 'Failed to fetch admin operations payments');
export const getRevenueAnalytics = run(operationsService.getRevenueAnalytics, 'Failed to fetch revenue analytics');
export const getDeliveryAnalytics = run(operationsService.getDeliveryAnalytics, 'Failed to fetch delivery analytics');
export const exportOrders = run(operationsService.exportOrders, 'Failed to export admin operations orders', 202);
export const getPromoCodeUsage = run(operationsService.getPromoCodeUsage, 'Failed to fetch promo code usage');
export const listFirstOrderDiscounts = run(operationsService.listFirstOrderDiscounts, 'Failed to fetch first order discounts');
