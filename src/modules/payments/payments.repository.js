import { pool, query } from '../../config/db.js';

export const withTransaction = async (callback) => {
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

export const findCustomerOrderForPayment = async (client, { orderId, userId }) => {
  const result = await client.query(
    `SELECT
       o.id,
       o.customer_id,
       o.payment_status,
       o.online_payment_amount
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     WHERE o.id = $1
       AND c.user_id = $2
     FOR UPDATE OF o`,
    [orderId, userId],
  );

  return result.rows[0] || null;
};

export const insertPayment = async (client, {
  orderId,
  method,
  amount,
  status,
  providerPayload,
}) => {
  const result = await client.query(
    `INSERT INTO payments (order_id, method, amount, status, provider_payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING *`,
    [orderId, method, amount, status, JSON.stringify(providerPayload || {})],
  );

  return result.rows[0];
};

export const listPayments = async ({ method, status }) => {
  const params = [];
  const conditions = [];

  if (method) {
    params.push(method);
    conditions.push(`p.method = $${params.length}`);
  }

  if (status) {
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT
       p.*,
       o.order_number,
       o.payment_status AS order_payment_status
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     ${whereClause}
     ORDER BY p.created_at DESC`,
    params,
  );

  return result.rows;
};

export const findPaymentById = async (paymentId) => {
  const result = await query(
    `SELECT
       p.*,
       o.order_number,
       o.payment_status AS order_payment_status
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     WHERE p.id = $1`,
    [paymentId],
  );

  return result.rows[0] || null;
};
