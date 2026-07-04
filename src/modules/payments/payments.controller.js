import { sendControllerError } from '../../utils/http.js';
import {
  getPayment as getPaymentService,
  initiateOrderPayment,
  listPayments,
} from './payments.service.js';

export const getPayments = async (request, response) => {
  try {
    const result = await listPayments({ user: request.user, query: request.query });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to fetch payments');
  }
};

export const getPayment = async (request, response) => {
  try {
    const result = await getPaymentService({ user: request.user, paymentId: request.params.id });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to fetch payment');
  }
};

export const payOrderOnline = async (request, response) => {
  try {
    const result = await initiateOrderPayment({ user: request.user, orderId: request.params.orderId, body: request.body });
    return response.status(201).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to initiate online payment');
  }
};
