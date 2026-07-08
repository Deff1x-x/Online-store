import { randomUUID } from 'crypto';
import { AppError } from '../../utils/AppError.js';
import * as repository from './payments.repository.js';

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const requirePayment = (payment) => {
  if (!payment) {
    throw new AppError(404, 'Payment was not found', 'payment_not_found');
  }

  return payment;
};

export const listPayments = async ({ query = {} }) => {
  const payments = await repository.listPayments({
    method: query.method,
    status: query.status,
  });

  return { payments };
};

export const getPayment = async ({ paymentId }) => {
  const payment = requirePayment(await repository.findPaymentById(paymentId));
  return { payment };
};

export const initiateOrderPayment = async ({ user, orderId }) => {
  return repository.withTransaction(async (client) => {
    const order = await repository.findCustomerOrderForPayment(client, {
      orderId,
      userId: user.id,
    });

    if (!order) {
      throw new AppError(404, 'Order was not found', 'order_not_found');
    }

    const amount = roundMoney(order.online_payment_amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError(400, 'Order online_payment_amount must be greater than zero', 'invalid_online_payment_amount');
    }

    const transactionId = `kaspi-placeholder-${randomUUID()}`;
    const paymentUrl = `https://kaspi.placeholder/pay/${transactionId}`;
    const qr = `kaspi-placeholder:${transactionId}`;
    const payment = await repository.insertPayment(client, {
      orderId: order.id,
      method: 'online',
      amount,
      status: 'pending',
      providerPayload: {
        provider: 'kaspi_placeholder',
        placeholder: true,
        transaction_id: transactionId,
        payment_url: paymentUrl,
        qr,
        note: 'No real authorization, capture, or hold is performed.',
      },
    });

    return {
      payment,
      payment_url: paymentUrl,
      qr,
    };
  });
};
