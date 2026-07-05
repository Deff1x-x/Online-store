import { randomUUID } from 'crypto';
import { AppError } from '../../utils/errors.js';
import {
  createPaymentRecord,
  findOrderByExternalPaymentId,
  findOrderForPaymentById,
  findPaymentById,
  findPaymentByTransactionId,
  findPayments,
  updateOrderExternalPaymentId,
  updateOrderPaymentStatus,
  updatePaymentStatus,
  withPaymentTransaction,
} from './payments.repository.js';

const apiPaymentMethod = 'kaspi_qr';
const dbPaymentMethod = 'qr_kaspi';
const paymentStatuses = new Set(['pending', 'completed', 'failed', 'refunded']);
const paymentMethods = new Set(['online', 'pos', 'online_card', 'qr_kaspi', 'qr_halyk', 'pos_terminal']);
const developmentEnvironments = new Set(['development', 'test']);
const webhookCompletedStatus = 'completed';
const webhookFailedStatus = 'failed';

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const assertUuidLike = (value, fieldName) => {
  if (!value || typeof value !== 'string') {
    throw new AppError(400, `${fieldName} is required`, `${fieldName}_required`);
  }
};

const assertCustomerOwnsOrder = (order, user) => {
  const userId = String(user?.id || '');
  const orderUserId = String(order.customer_id || '');
  const customerRecordUserId = order.customer_user_id ? String(order.customer_user_id) : null;

  if (orderUserId !== userId && customerRecordUserId !== userId) {
    throw new AppError(403, 'Customer can only pay their own order', 'order_access_denied');
  }
};

const createKaspiPlaceholder = ({ invoiceId }) => {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  return {
    payment_url: `https://kaspi.placeholder/pay/${invoiceId}`,
    qr_url: `https://kaspi.placeholder/qr/${invoiceId}`,
    expires_at: expiresAt,
  };
};

export const verifyKaspiSignature = ({ signature }) => {
  if (!signature) {
    throw new AppError(400, 'signature is required', 'signature_required');
  }

  if (developmentEnvironments.has(process.env.NODE_ENV)) {
    return true;
  }

  throw new AppError(
    501,
    'Kaspi webhook signature verification is not implemented because the documentation does not describe the algorithm',
    'kaspi_signature_not_implemented',
  );
};

export const listPayments = async ({ query = {} }) => {
  const { method, status, date_from: dateFrom, date_to: dateTo } = query;

  if (method && !paymentMethods.has(method)) {
    throw new AppError(400, 'Unsupported payment method filter', 'invalid_payment_method');
  }

  if (status && !paymentStatuses.has(status)) {
    throw new AppError(400, 'Unsupported payment status filter', 'invalid_payment_status');
  }

  const payments = await findPayments({ method, status, dateFrom, dateTo });
  const totals = payments.reduce(
    (accumulator, payment) => {
      const amount = Number(payment.amount || 0);
      accumulator.by_method[payment.method] = roundMoney((accumulator.by_method[payment.method] || 0) + amount);
      accumulator.by_status[payment.status] = roundMoney((accumulator.by_status[payment.status] || 0) + amount);
      accumulator.total_amount = roundMoney(accumulator.total_amount + amount);
      return accumulator;
    },
    {
      by_method: {},
      by_status: {},
      total_amount: 0,
    },
  );

  return { payments, totals };
};

export const getPayment = async ({ paymentId }) => {
  assertUuidLike(paymentId, 'payment_id');

  const payment = await findPaymentById(paymentId);

  if (!payment) {
    throw new AppError(404, 'Payment not found', 'payment_not_found');
  }

  return { payment };
};

export const initiateOrderPayment = async ({ user, orderId, body = {} }) => {
  assertUuidLike(orderId, 'order_id');

  if (body.method !== apiPaymentMethod) {
    throw new AppError(400, 'method must be kaspi_qr', 'invalid_payment_method');
  }

  return withPaymentTransaction(async (client) => {
    const order = await findOrderForPaymentById(client, orderId);

    if (!order) {
      throw new AppError(404, 'Order not found', 'order_not_found');
    }

    assertCustomerOwnsOrder(order, user);

    if (order.payment_status !== 'pending') {
      throw new AppError(400, 'Order payment_status must be pending', 'order_payment_not_pending');
    }

    const amount = roundMoney(order.online_payment_amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError(400, 'Order online_payment_amount must be greater than zero', 'invalid_online_payment_amount');
    }

    const invoiceId = `kaspi-${randomUUID()}`;
    const kaspiPlaceholder = createKaspiPlaceholder({ invoiceId });

    // Compatibility mapping: API accepts "kaspi_qr", while the DB enum stores "qr_kaspi".
    const payment = await createPaymentRecord(client, {
      orderId: order.id,
      method: dbPaymentMethod,
      amount,
      status: 'pending',
      transactionId: invoiceId,
      providerPayload: {
        provider: 'kaspi',
        placeholder: true,
        invoiceId,
        ...kaspiPlaceholder,
      },
    });

    await updateOrderExternalPaymentId(client, {
      orderId: order.id,
      externalPaymentId: invoiceId,
    });

    return {
      ...kaspiPlaceholder,
      payment_id: payment.id,
      order_id: order.id,
      amount,
      method: apiPaymentMethod,
    };
  });
};

export const handleKaspiWebhook = async ({ body = {} }) => {
  const { invoiceId, status, amount, timestamp, signature } = body;

  if (!invoiceId) {
    throw new AppError(400, 'invoiceId is required', 'invoice_id_required');
  }

  if (!status) {
    throw new AppError(400, 'status is required', 'status_required');
  }

  if (amount === undefined || amount === null) {
    throw new AppError(400, 'amount is required', 'amount_required');
  }

  if (![webhookCompletedStatus, webhookFailedStatus].includes(status)) {
    throw new AppError(400, 'Unsupported Kaspi webhook status', 'unsupported_kaspi_status');
  }

  verifyKaspiSignature({ invoiceId, status, amount, timestamp, signature });

  return withPaymentTransaction(async (client) => {
    const order = await findOrderByExternalPaymentId(client, invoiceId);

    if (!order) {
      throw new AppError(404, 'Order for invoiceId not found', 'order_not_found');
    }

    const payment = await findPaymentByTransactionId(client, invoiceId);

    if (!payment || String(payment.order_id) !== String(order.id)) {
      throw new AppError(404, 'Payment for invoiceId not found', 'payment_not_found');
    }

    const webhookPayload = {
      kaspi_webhook: {
        invoiceId,
        status,
        amount,
        timestamp: timestamp || null,
        received_at: new Date().toISOString(),
      },
    };

    if (status === webhookCompletedStatus) {
      if (payment.status !== 'completed') {
        await updatePaymentStatus(client, {
          paymentId: payment.id,
          status: 'completed',
          providerPayload: webhookPayload,
        });
      }

      if (order.payment_status !== 'online_paid') {
        await updateOrderPaymentStatus(client, {
          orderId: order.id,
          paymentStatus: 'online_paid',
        });
      }

      return { status: 'ok' };
    }

    if (payment.status !== 'completed' && payment.status !== 'failed') {
      await updatePaymentStatus(client, {
        paymentId: payment.id,
        status: 'failed',
        providerPayload: webhookPayload,
      });
    }

    return { status: 'ok' };
  });
};
