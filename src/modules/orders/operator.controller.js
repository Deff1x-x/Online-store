import { sendControllerError } from '../../utils/http.js';
import {
  getOperatorOrders as getOperatorOrdersService,
  pickOrder as pickOrderService,
} from './operator.service.js';

export const getOperatorOrders = async (request, response) => {
  try {
    const result = await getOperatorOrdersService({
      user: request.user,
      status: request.query.status,
    });

    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to fetch operator orders');
  }
};

export const pickOrder = async (request, response) => {
  try {
    const result = await pickOrderService({
      user: request.user,
      orderId: request.params.id,
      items: request.body.items,
    });

    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to pick order');
  }
};
