import { sendControllerError } from '../../utils/http.js';
import {
  getAnalytics as getAnalyticsService,
  listInventory as listInventoryService,
  listStoreOrders,
  pickStoreOrder,
  receiveInventory as receiveInventoryService,
  recordActualWeight as recordActualWeightService,
  updateInventory as updateInventoryService,
  updateOrderStatus as updateOrderStatusService,
} from './my-store.service.js';

export const getOrders = async (request, response) => {
  try {
    const result = await listStoreOrders({ user: request.user, status: request.query.status });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to fetch store orders');
  }
};

export const pickOrder = async (request, response) => {
  try {
    const result = await pickStoreOrder({
      user: request.user,
      orderId: request.params.id,
      items: request.body.items,
    });

    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to pick order');
  }
};

export const updateOrderStatus = async (request, response) => {
  try {
    const result = await updateOrderStatusService({ user: request.user, params: request.params, body: request.body });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to update order status');
  }
};

export const recordActualWeight = async (request, response) => {
  try {
    const result = await recordActualWeightService({ user: request.user, params: request.params, body: request.body });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to record actual weight');
  }
};

export const getInventory = async (request, response) => {
  try {
    const result = await listInventoryService({ user: request.user });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to fetch inventory');
  }
};

export const updateInventory = async (request, response) => {
  try {
    const result = await updateInventoryService({ user: request.user, params: request.params, body: request.body });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to update inventory');
  }
};

export const receiveInventory = async (request, response) => {
  try {
    const result = await receiveInventoryService({ user: request.user, params: request.params, body: request.body });
    return response.status(201).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to receive inventory');
  }
};

export const getAnalytics = async (request, response) => {
  try {
    const result = await getAnalyticsService({ user: request.user, query: request.query });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to fetch store analytics');
  }
};
