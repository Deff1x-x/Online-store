import { pool } from '../../config/db.js';

export const withPaymentTransaction = async (callback) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const findOrderForPaymentById = async (client, orderId) => {
  const result = await client.query(
    `SELECT
       orders.id,
       orders.order_number,
       orders.customer_id,
       orders.customer_record_id,
       customers.user_id AS customer_user_id,
       orders.payment_status,
       orders.online_payment_amount,
       orders.external_payment_id
     FROM orders
     LEFT JOIN customers ON customers.id = orders.customer_record_id
     WHERE orders.id = $1
     FOR UPDATE OF orders`,
    [orderId],
  );

  return result.rows[0] || null;
};

export const createPaymentRecord = async (client, {
  orderId,
  method,
  amount,
  status,
  transactionId,
  providerPayload,
}) => {
  const result = await client.query(
    `INSERT INTO payments (
       order_id,
       method,
       amount,
       status,
       transaction_id,
       provider_payload
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING
       id,
       order_id,
       method,
       amount,
       status,
       transaction_id,
       receipt_url,
       provider_payload,
       created_at,
       updated_at`,
    [orderId, method, amount, status, transactionId, providerPayload],
  );

  return result.rows[0];
};

export const updateOrderExternalPaymentId = async (client, { orderId, externalPaymentId }) => {
  const result = await client.query(
    `UPDATE orders
     SET external_payment_id = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, external_payment_id`,
    [orderId, externalPaymentId],
  );

  return result.rows[0] || null;
};

export const findOrderByExternalPaymentId = async (client, externalPaymentId) => {
  const result = await client.query(
    `SELECT
       id,
       order_number,
       payment_status,
       external_payment_id
     FROM orders
     WHERE external_payment_id = $1
     FOR UPDATE`,
    [externalPaymentId],
  );

  return result.rows[0] || null;
};

export const findPaymentByTransactionId = async (client, transactionId) => {
  const result = await client.query(
    `SELECT
       id,
       order_id,
       method,
       amount,
       status,
       transaction_id,
       receipt_url,
       provider_payload,
       created_at,
       updated_at
     FROM payments
     WHERE transaction_id = $1
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE`,
    [transactionId],
  );

  return result.rows[0] || null;
};

export const updatePaymentStatus = async (client, { paymentId, status, providerPayload }) => {
  const result = await client.query(
    `UPDATE payments
     SET status = $2,
         provider_payload = COALESCE(provider_payload, '{}'::JSONB) || $3::JSONB,
         updated_at = NOW()
     WHERE id = $1
     RETURNING
       id,
       order_id,
       method,
       amount,
       status,
       transaction_id,
       receipt_url,
       provider_payload,
       created_at,
       updated_at`,
    [paymentId, status, providerPayload],
  );

  return result.rows[0] || null;
};

export const updateOrderPaymentStatus = async (client, { orderId, paymentStatus }) => {
  const result = await client.query(
    `UPDATE orders
     SET payment_status = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, payment_status`,
    [orderId, paymentStatus],
  );

  return result.rows[0] || null;
};

export const findPayments = async ({ method, status, dateFrom, dateTo }) => {
  const conditions = [];
  const values = [];

  if (method) {
    values.push(method);
    conditions.push(`payments.method = $${values.length}`);
  }

  if (status) {
    values.push(status);
    conditions.push(`payments.status = $${values.length}`);
  }

  if (dateFrom) {
    values.push(dateFrom);
    conditions.push(`payments.created_at >= $${values.length}`);
  }

  if (dateTo) {
    values.push(dateTo);
    conditions.push(`payments.created_at <= $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(
    `SELECT
       payments.id,
       payments.order_id,
       orders.order_number,
       payments.method,
       payments.amount,
       payments.status,
       payments.transaction_id,
       payments.receipt_url,
       payments.created_at,
       payments.updated_at
     FROM payments
     INNER JOIN orders ON orders.id = payments.order_id
     ${whereClause}
     ORDER BY payments.created_at DESC`,
    values,
  );

  return result.rows;
};

export const findPaymentById = async (paymentId) => {
  const result = await pool.query(
    `SELECT
       payments.id,
       payments.order_id,
       orders.order_number,
       payments.method,
       payments.amount,
       payments.status,
       payments.transaction_id,
       payments.receipt_url,
       payments.provider_payload,
       payments.created_at,
       payments.updated_at
     FROM payments
     INNER JOIN orders ON orders.id = payments.order_id
     WHERE payments.id = $1
     LIMIT 1`,
    [paymentId],
  );

  return result.rows[0] || null;
};
