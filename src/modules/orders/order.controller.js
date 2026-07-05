import { sendControllerError } from '../../utils/http.js';
import {
  createOrder as createOrderService,
  validatePromoForOrder as validatePromoForOrderService,
} from './order.service.js';

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

export const validatePromoForOrder = async (request, response) => {
  try {
    const result = await validatePromoForOrderService({
      user: request.user,
      orderId: request.params.id,
      promo_code: request.body.promo_code,
      order_total: request.body.order_total,
    });

    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to validate promo code');
  }
};
