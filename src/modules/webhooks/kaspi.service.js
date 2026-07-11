import { AppError } from '../../utils/AppError.js';
import * as repository from './kaspi.repository.js';

const publicPayment = (payment) => {
  const { order_payment_status: _orderPaymentStatus, ...result } = payment;
  return result;
};

export const handleKaspiWebhook = async ({ body = {} }) => {
  const paymentId = body.payment_id;
  const transactionId = body.transaction_id;

  if (!paymentId && !transactionId) {
    throw new AppError(400, 'payment_id or transaction_id is required', 'payment_reference_required');
  }

  return repository.withTransaction(async (client) => {
    const payment = paymentId
      ? await repository.findPaymentByIdForUpdate(client, paymentId)
      : await repository.findPaymentByTransactionIdForUpdate(client, transactionId);

    if (!payment) {
      throw new AppError(404, 'Payment was not found', 'payment_not_found');
    }

    const storedTransactionId = payment.provider_payload?.transaction_id;
    if (paymentId && transactionId && storedTransactionId && String(storedTransactionId) !== String(transactionId)) {
      throw new AppError(409, 'Payment and transaction references do not match', 'payment_reference_mismatch');
    }

    if (payment.status === 'completed') {
      return {
        message: 'Kaspi placeholder webhook already processed',
        payment: publicPayment(payment),
      };
    }

    if (payment.status !== 'pending') {
      throw new AppError(409, 'Payment cannot be completed from its current status', 'invalid_payment_status_transition');
    }

    if (payment.order_payment_status !== 'pending') {
      throw new AppError(409, 'Order cannot be marked online paid from its current status', 'invalid_order_payment_status_transition');
    }

    const updatedPayment = await repository.completePayment(client, {
      paymentId: payment.id,
      webhookPayload: body,
    });
    if (!updatedPayment) {
      throw new AppError(409, 'Payment was updated concurrently', 'payment_update_conflict');
    }

    const updatedOrder = await repository.markOrderOnlinePaid(client, payment.order_id);
    if (!updatedOrder) {
      throw new AppError(409, 'Order was updated concurrently', 'order_update_conflict');
    }

    return {
      message: 'Kaspi placeholder webhook processed',
      payment: updatedPayment,
    };
  });
};
