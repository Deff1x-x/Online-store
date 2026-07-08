import { pool, query } from '../../../config/db.js';

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

const customerWhere = ({ storeId, subscriptionStatus, search }, params) => {
  const conditions = [];

  if (storeId) {
    params.push(storeId);
    conditions.push(`c.store_id = $${params.length}`);
  }

  if (subscriptionStatus) {
    params.push(subscriptionStatus);
    conditions.push(`c.subscription_status = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(c.phone ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
  }

  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
};

export const listCustomers = async ({ storeId, subscriptionStatus, search, page, limit }) => {
  const params = [];
  const whereClause = customerWhere({ storeId, subscriptionStatus, search }, params);
  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM customers c
     ${whereClause}`,
    params,
  );

  const offset = (page - 1) * limit;
  const listParams = [...params, limit, offset];
  const result = await query(
    `SELECT
       c.*,
       COUNT(o.id)::int AS orders_count
     FROM customers c
     LEFT JOIN orders o ON o.customer_id = c.id
     ${whereClause}
     GROUP BY c.id
     ORDER BY c.created_at DESC
     LIMIT $${listParams.length - 1}
     OFFSET $${listParams.length}`,
    listParams,
  );

  return {
    customers: result.rows,
    total: countResult.rows[0].total,
  };
};

export const findCustomerById = async (id) => {
  const result = await query(
    `SELECT
       c.*,
       COUNT(o.id)::int AS orders_count
     FROM customers c
     LEFT JOIN orders o ON o.customer_id = c.id
     WHERE c.id = $1
     GROUP BY c.id`,
    [id],
  );

  return result.rows[0] || null;
};

export const findCustomerAddresses = async (customerId) => {
  const result = await query(
    `SELECT
       ca.*,
       sc.store_id,
       sc.address AS coverage_address,
       sc.entrance_count
     FROM customer_addresses ca
     JOIN store_coverage sc ON sc.id = ca.store_coverage_id
     WHERE ca.customer_id = $1
     ORDER BY ca.created_at DESC`,
    [customerId],
  );

  return result.rows;
};

export const findRecentOrders = async (customerId) => {
  const result = await query(
    `SELECT
       id,
       order_number,
       subtotal,
       discount_total,
       delivery_fee,
       online_payment_amount,
       online_capture_amount,
       pos_terminal_topup,
       final_total,
       delivery_status,
       payment_status,
       fulfillment_window,
       delivery_date,
       created_at
     FROM orders
     WHERE customer_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [customerId],
  );

  return result.rows;
};

export const listSubscriptions = async ({ storeId, status }) => {
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

export const pauseSubscriptionForCustomer = async (client, customerId) => {
  const currentResult = await client.query(
    `SELECT *
     FROM subscriptions
     WHERE customer_id = $1
     ORDER BY expires_at DESC NULLS LAST, created_at DESC
     LIMIT 1
     FOR UPDATE`,
    [customerId],
  );

  if (currentResult.rowCount === 0) {
    return null;
  }

  const updateResult = await client.query(
    `UPDATE subscriptions
     SET status = 'paused',
         auto_renew = FALSE,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [currentResult.rows[0].id],
  );

  await client.query(
    `UPDATE customers
     SET subscription_status = 'paused',
         subscription_auto_renew = FALSE,
         updated_at = NOW()
     WHERE id = $1`,
    [customerId],
  );

  return updateResult.rows[0];
};

export const listConsentLogs = async () => {
  const result = await query(
    `SELECT
       u.id AS user_id,
       u.phone,
       u.name,
       consent.consent_type,
       uc.consented_at
     FROM user_consents uc
     JOIN users u ON u.id = uc.user_id
     CROSS JOIN LATERAL (
       VALUES
         ('privacy_policy', uc.privacy_policy),
         ('terms_of_service', uc.terms_of_service)
     ) AS consent(consent_type, accepted)
     WHERE consent.accepted = TRUE
     ORDER BY uc.consented_at DESC`,
  );

  return result.rows;
};

export const exportCustomerRows = async ({ storeId, subscriptionStatus, search }) => {
  const params = [];
  const whereClause = customerWhere({ storeId, subscriptionStatus, search }, params);
  const result = await query(
    `SELECT
       c.id,
       c.store_id,
       c.name,
       c.phone,
       c.email,
       c.subscription_status,
       c.subscription_start_date,
       c.subscription_end_date,
       c.subscription_auto_renew,
       COUNT(o.id)::int AS orders_count,
       c.created_at
     FROM customers c
     LEFT JOIN orders o ON o.customer_id = c.id
     ${whereClause}
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    params,
  );

  return result.rows;
};
