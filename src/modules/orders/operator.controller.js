import { sendControllerError } from '../../utils/http.js';
import {
  getOperatorOrders as getOperatorOrdersService,
  pickOrder as pickOrderService,
  recordActualWeight as recordActualWeightService,
  updateDeliveryStatus as updateDeliveryStatusService,
} from './operator.service.js';

export const getOperatorOrders = async (request, response) => {
  try {
    const result = await getOperatorOrdersService({
      user: request.user,
      delivery_date: request.query.delivery_date,
      delivery_status: request.query.delivery_status,
      payment_status: request.query.payment_status,
      status: request.query.status,
    });

    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to fetch operator orders');
  }
};

export const updateDeliveryStatus = async (request, response) => {
  try {
    const result = await updateDeliveryStatusService({
      user: request.user,
      orderId: request.params.id,
      deliveryStatus: request.body.delivery_status || request.body.status,
    });

    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to update order delivery status');
  }
};

export const recordActualWeight = async (request, response) => {
  try {
    const result = await recordActualWeightService({
      user: request.user,
      orderId: request.params.id,
      actualWeight: request.body.actual_weight,
    });

    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to record order actual weight');
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
