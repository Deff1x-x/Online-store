import { AppError } from '../../utils/AppError.js';
import * as repository from './kaspi.repository.js';

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

    const updatedPayment = await repository.completePayment(client, {
      paymentId: payment.id,
      webhookPayload: body,
    });
    await repository.markOrderOnlinePaid(client, payment.order_id);

    return {
      message: 'Kaspi placeholder webhook processed',
      payment: updatedPayment,
    };
  });
};
