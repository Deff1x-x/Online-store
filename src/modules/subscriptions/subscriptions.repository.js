import { pool, query } from '../../config/db.js';

export const findCustomerByUserId = async (userId) => {
  const result = await query(
    `SELECT id, user_id, store_id, subscription_status, subscription_end_date
     FROM customers
     WHERE user_id = $1`,
    [userId],
  );

  return result.rows[0] || null;
};

export const findCustomerById = async (customerId) => {
  const result = await query(
    `SELECT
       c.id,
       c.user_id,
       c.store_id,
       c.subscription_status,
       c.subscription_end_date,
       s.billing_period AS latest_billing_period,
       s.expires_at AS latest_expires_at
     FROM customers c
     LEFT JOIN LATERAL (
       SELECT billing_period, expires_at
       FROM subscriptions
       WHERE customer_id = c.id
       ORDER BY expires_at DESC NULLS LAST, created_at DESC
       LIMIT 1
     ) s ON TRUE
     WHERE c.id = $1`,
    [customerId],
  );

  return result.rows[0] || null;
};

export const createSubscriptionForCustomer = async ({
  customerId,
  amount,
  billingPeriod,
  expiresAt,
}) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const activeResult = await client.query(
      `SELECT id
       FROM subscriptions
       WHERE customer_id = $1
         AND status = 'active'
         AND expires_at > NOW()
       LIMIT 1
       FOR UPDATE`,
      [customerId],
    );

    if (activeResult.rowCount > 0) {
      await client.query('ROLLBACK');
      return { alreadyActive: true };
    }

    const subscriptionResult = await client.query(
      `INSERT INTO subscriptions (
         customer_id,
         amount,
         billing_period,
         status,
         expires_at,
         next_billing_date,
         auto_renew
       )
       VALUES ($1, $2, $3, 'active', $4::timestamptz, $4::date, TRUE)
       RETURNING *`,
      [customerId, amount, billingPeriod, expiresAt],
    );

    await client.query(
      `UPDATE customers
       SET subscription_status = 'active',
           subscription_start_date = CURRENT_DATE,
           subscription_end_date = $2::date,
           subscription_auto_renew = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [customerId, expiresAt],
    );

    await client.query('COMMIT');

    return { subscription: subscriptionResult.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const renewSubscriptionForCustomer = async ({ customerId, expiresAt }) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      `SELECT *
       FROM subscriptions
       WHERE customer_id = $1
       ORDER BY expires_at DESC NULLS LAST, created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [customerId],
    );

    let subscription;

    if (currentResult.rowCount === 0) {
      const createdResult = await client.query(
        `INSERT INTO subscriptions (
           customer_id,
           amount,
           billing_period,
           status,
           expires_at,
           next_billing_date,
           auto_renew
         )
         VALUES ($1, 3900.00, 'monthly', 'active', $2::timestamptz, $2::date, TRUE)
         RETURNING *`,
        [customerId, expiresAt],
      );
      subscription = createdResult.rows[0];
    } else {
      const existing = currentResult.rows[0];
      const updatedResult = await client.query(
        `UPDATE subscriptions
         SET status = 'active',
             expires_at = $2::timestamptz,
             next_billing_date = $2::date,
             auto_renew = TRUE,
             cancelled_at = NULL,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [existing.id, expiresAt],
      );
      subscription = updatedResult.rows[0];
    }

    await client.query(
      `UPDATE customers
       SET subscription_status = 'active',
           subscription_start_date = COALESCE(subscription_start_date, CURRENT_DATE),
           subscription_end_date = $2::date,
           subscription_auto_renew = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [customerId, expiresAt],
    );

    await client.query('COMMIT');

    return subscription;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const cancelSubscriptionForCustomer = async ({ customerId, immediate }) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const subscriptionResult = await client.query(
      `SELECT *
       FROM subscriptions
       WHERE customer_id = $1
         AND status = 'active'
       ORDER BY expires_at DESC NULLS LAST, created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [customerId],
    );

    if (subscriptionResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const subscription = subscriptionResult.rows[0];
    const updatedResult = await client.query(
      immediate
        ? `UPDATE subscriptions
           SET status = 'cancelled',
               expires_at = NOW(),
               next_billing_date = NULL,
               auto_renew = FALSE,
               cancelled_at = NOW(),
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`
        : `UPDATE subscriptions
           SET auto_renew = FALSE,
               cancelled_at = NOW(),
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
      [subscription.id],
    );

    await client.query(
      immediate
        ? `UPDATE customers
           SET subscription_status = 'cancelled',
               subscription_end_date = CURRENT_DATE,
               subscription_auto_renew = FALSE,
               updated_at = NOW()
           WHERE id = $1`
        : `UPDATE customers
           SET subscription_auto_renew = FALSE,
               updated_at = NOW()
           WHERE id = $1`,
      [customerId],
    );

    await client.query('COMMIT');

    return updatedResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listSubscriptionsWithCustomers = async ({ storeId, status }) => {
  const params = [];
  const conditions = [];

  if (storeId) {
    params.push(storeId);
    conditions.push(`c.store_id = $${params.length}`);
  }

  if (status) {
    params.push(status);
    conditions.push(`s.status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT
       s.*,
       c.id AS customer_id,
       c.name AS customer_name,
       c.phone AS customer_phone,
       c.email AS customer_email,
       c.store_id
     FROM subscriptions s
     JOIN customers c ON c.id = s.customer_id
     ${whereClause}
     ORDER BY s.created_at DESC`,
    params,
  );

  return result.rows;
};
