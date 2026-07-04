import { sendControllerError } from '../../utils/http.js';
import {
  getMyOrder as getMyOrderService,
  listMyOrders,
} from './my-orders.service.js';

export const getMyOrders = async (request, response) => {
  try {
    const result = await listMyOrders({ user: request.user, query: request.query });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to fetch customer orders');
  }
};

export const getMyOrder = async (request, response) => {
  try {
    const result = await getMyOrderService({ user: request.user, orderId: request.params.id });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to fetch customer order');
  }
};
