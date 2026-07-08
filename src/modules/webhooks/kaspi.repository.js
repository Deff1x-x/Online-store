import { pool } from '../../config/db.js';

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

export const findPaymentByIdForUpdate = async (client, paymentId) => {
  const result = await client.query(
    `SELECT *
     FROM payments
     WHERE id = $1
     FOR UPDATE`,
    [paymentId],
  );

  return result.rows[0] || null;
};

export const findPaymentByTransactionIdForUpdate = async (client, transactionId) => {
  const result = await client.query(
    `SELECT *
     FROM payments
     WHERE provider_payload ->> 'transaction_id' = $1
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE`,
    [transactionId],
  );

  return result.rows[0] || null;
};

export const completePayment = async (client, { paymentId, webhookPayload }) => {
  const result = await client.query(
    `UPDATE payments
     SET status = 'completed',
         provider_payload = provider_payload || jsonb_build_object(
           'kaspi_webhook',
           $2::jsonb,
           'completed_at',
           NOW()
         ),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [paymentId, JSON.stringify(webhookPayload || {})],
  );

  return result.rows[0];
};

export const markOrderOnlinePaid = async (client, orderId) => {
  await client.query(
    `UPDATE orders
     SET payment_status = 'online_paid',
         updated_at = NOW()
     WHERE id = $1`,
    [orderId],
  );
};
