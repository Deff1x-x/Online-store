import {
  getPayment as getPaymentService,
  initiateOrderPayment,
  listPayments,
} from './payments.service.js';

const handle = (action, status = 200) => async (request, response, next) => {
  try {
    return response.status(status).json(await action(request));
  } catch (error) {
    return next(error);
  }
};

export const getPayments = handle((request) => listPayments({ query: request.query }));
export const getPayment = handle((request) => getPaymentService({ paymentId: request.params.id }));
export const payOrderOnline = handle((request) => initiateOrderPayment({
  user: request.user,
  orderId: request.params.id || request.params.orderId,
}), 201);
