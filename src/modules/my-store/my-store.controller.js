import {
  getAnalytics as getAnalyticsService,
  listInventory,
  listStoreOrders,
  pickStoreOrder,
  receiveInventory as receiveInventoryService,
  recordActualWeight as recordActualWeightService,
  updateInventory as updateInventoryService,
  updateOrderStatus as updateOrderStatusService,
} from './my-store.service.js';

export const getOrders = async (request, response, next) => {
  try {
    const result = await listStoreOrders({
      user: request.user,
      query: request.query,
    });

    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const pickOrder = async (request, response, next) => {
  try {
    const result = await pickStoreOrder({
      user: request.user,
      orderId: request.params.id,
    });

    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const recordActualWeight = async (request, response, next) => {
  try {
    const result = await recordActualWeightService({
      user: request.user,
      orderId: request.params.id,
      body: request.body,
    });

    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const updateOrderStatus = async (request, response, next) => {
  try {
    const result = await updateOrderStatusService({
      user: request.user,
      orderId: request.params.id,
      body: request.body,
    });

    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const getInventory = async (request, response, next) => {
  try {
    const result = await listInventory({ user: request.user });
    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const updateInventory = async (request, response, next) => {
  try {
    const result = await updateInventoryService({
      user: request.user,
      productId: request.params.product_id,
      body: request.body,
    });

    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const receiveInventory = async (request, response, next) => {
  try {
    const result = await receiveInventoryService({
      user: request.user,
      productId: request.params.product_id,
      body: request.body,
    });

    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const getAnalytics = async (request, response, next) => {
  try {
    const result = await getAnalyticsService({
      user: request.user,
      query: request.query,
    });

    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};
