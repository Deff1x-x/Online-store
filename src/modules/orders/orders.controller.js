import {
  createOrder as createOrderService,
  getMyOrder as getMyOrderService,
  listMyOrders,
} from './orders.service.js';

export const createOrder = async (request, response, next) => {
  try {
    const result = await createOrderService({
      user: request.user,
      body: request.body,
    });

    return response.status(201).json(result);
  } catch (error) {
    return next(error);
  }
};

export const getMyOrders = async (request, response, next) => {
  try {
    const result = await listMyOrders({ user: request.user });
    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const getMyOrder = async (request, response, next) => {
  try {
    const result = await getMyOrderService({
      user: request.user,
      orderId: request.params.id,
    });

    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};
