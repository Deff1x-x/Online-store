import { sendControllerError } from '../../utils/http.js';
import { createOrder as createOrderService } from './order.service.js';

export const createOrder = async (request, response) => {
  try {
    const result = await createOrderService({
      user: request.user,
      ...request.body,
    });

    return response.status(201).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to create order');
  }
};
