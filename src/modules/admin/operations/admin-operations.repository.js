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

const addPeriodFilters = ({ dateFrom, dateTo }, params, conditions, column) => {
  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`${column} >= $${params.length}::date`);
  }

  if (dateTo) {
    params.push(dateTo);
    conditions.push(`${column} < ($${params.length}::date + INTERVAL '1 day')`);
  }
};

const orderWhere = ({ storeId, status, dateFrom, dateTo }, params) => {
  const conditions = [];

  if (storeId) {
    params.push(storeId);
    conditions.push(`o.store_id = $${params.length}`);
  }

  if (status) {
    params.push(status);
    conditions.push(`o.delivery_status = $${params.length}`);
  }

  addPeriodFilters({ dateFrom, dateTo }, params, conditions, 'o.created_at');

  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
};

export const listOrders = async ({ storeId, status, dateFrom, dateTo, page, limit }) => {
  const params = [];
  const whereClause = orderWhere({ storeId, status, dateFrom, dateTo }, params);
  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM orders o
     ${whereClause}`,
    params,
  );

  const offset = (page - 1) * limit;
  const listParams = [...params, limit, offset];
  const result = await query(
    `SELECT
       o.id,
       o.order_number,
       o.store_id,
       s.name AS store_name,
       o.customer_id,
       c.name AS customer_name,
       c.phone AS customer_phone,
       o.subtotal,
       o.discount_total,
       o.delivery_fee,
       o.online_payment_amount,
       o.online_capture_amount,
       o.pos_terminal_topup,
       o.final_total,
       o.fulfillment_window,
       o.payment_status,
       o.delivery_status,
       o.delivery_date,
       o.created_at,
       o.updated_at
     FROM orders o
     JOIN stores s ON s.id = o.store_id
     JOIN customers c ON c.id = o.customer_id
     ${whereClause}
     ORDER BY o.created_at DESC
     LIMIT $${listParams.length - 1}
     OFFSET $${listParams.length}`,
    listParams,
  );

  return {
    orders: result.rows,
    total: countResult.rows[0].total,
  };
};

export const findOrderById = async (id) => {
  const result = await query(
    `SELECT
       o.*,
       s.name AS store_name,
       c.name AS customer_name,
       c.phone AS customer_phone,
       c.email AS customer_email
     FROM orders o
     JOIN stores s ON s.id = o.store_id
     JOIN customers c ON c.id = o.customer_id
     WHERE o.id = $1`,
    [id],
  );

  return result.rows[0] || null;
};

export const findOrderItems = async (orderId) => {
  const result = await query(
    `SELECT
       oi.*,
       p.name,
       p.category,
       p.unit,
       p.is_weighted
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.created_at ASC`,
    [orderId],
  );

  return result.rows;
};

export const findOrderStatusHistory = async (orderId) => {
  const result = await query(
    `SELECT
       osh.*,
       u.name AS changed_by_name,
       u.email AS changed_by_email
     FROM order_status_history osh
     LEFT JOIN users u ON u.id = osh.changed_by
     WHERE osh.order_id = $1
     ORDER BY osh.created_at ASC`,
    [orderId],
  );

  return result.rows;
};

export const findOrderPayments = async (orderId) => {
  const result = await query(
    `SELECT *
     FROM payments
     WHERE order_id = $1
     ORDER BY created_at ASC`,
    [orderId],
  );

  return result.rows;
};

export const findOrderForUpdate = async (client, id) => {
  const result = await client.query(
    `SELECT *
     FROM orders
     WHERE id = $1
     FOR UPDATE`,
    [id],
  );

  return result.rows[0] || null;
};

export const returnOrderInventory = async (client, orderId) => {
  await client.query(
    `UPDATE store_inventory si
     SET quantity = si.quantity + returned.quantity,
         stock_quantity = si.stock_quantity + CEIL(returned.quantity)::int,
         status = CASE
           WHEN si.quantity + returned.quantity <= 0 THEN 'out_of_stock'
           WHEN si.quantity + returned.quantity <= 2 THEN 'low_stock'
           ELSE 'available'
         END,
         updated_at = NOW()
     FROM (
       SELECT o.store_id, oi.product_id, SUM(oi.quantity)::numeric AS quantity
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = $1
       GROUP BY o.store_id, oi.product_id
     ) returned
     WHERE si.store_id = returned.store_id
       AND si.product_id = returned.product_id`,
    [orderId],
  );
};

export const insertCompletedPosPayment = async (client, order) => {
  await client.query(
    `INSERT INTO payments (order_id, method, amount, status, provider_payload)
     VALUES ($1, 'pos_terminal', $2, 'completed', '{}'::jsonb)`,
    [order.id, order.pos_terminal_topup],
  );
};

export const markOrderDelivered = async (client, orderId) => {
  const result = await client.query(
    `UPDATE orders
     SET delivery_status = 'delivered',
         payment_status = 'fully_paid',
         delivered_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [orderId],
  );

  return result.rows[0];
};

export const updateOrderDeliveryStatus = async (client, { orderId, deliveryStatus }) => {
  const result = await client.query(
    `UPDATE orders
     SET delivery_status = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [orderId, deliveryStatus],
  );

  return result.rows[0];
};

export const insertOrderStatusHistory = async (client, {
  orderId,
  oldStatus,
  newStatus,
  changedBy,
}) => {
  await client.query(
    `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
     VALUES ($1, $2, $3, $4)`,
    [orderId, oldStatus, newStatus, changedBy],
  );
};

const paymentWhere = ({ storeId, method, status, dateFrom, dateTo }, params) => {
  const conditions = [];

  if (storeId) {
    params.push(storeId);
    conditions.push(`o.store_id = $${params.length}`);
  }

  if (method) {
    params.push(method);
    conditions.push(`p.method = $${params.length}`);
  }

  if (status) {
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }

  addPeriodFilters({ dateFrom, dateTo }, params, conditions, 'p.created_at');

  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
};

export const listPayments = async ({ storeId, method, status, dateFrom, dateTo, page, limit }) => {
  const params = [];
  const whereClause = paymentWhere({ storeId, method, status, dateFrom, dateTo }, params);
  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     ${whereClause}`,
    params,
  );

  const offset = (page - 1) * limit;
  const listParams = [...params, limit, offset];
  const result = await query(
    `SELECT
       p.*,
       o.order_number,
       o.store_id,
       s.name AS store_name,
       o.delivery_status,
       o.payment_status
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     JOIN stores s ON s.id = o.store_id
     ${whereClause}
     ORDER BY p.created_at DESC
     LIMIT $${listParams.length - 1}
     OFFSET $${listParams.length}`,
    listParams,
  );

  return {
    payments: result.rows,
    total: countResult.rows[0].total,
  };
};

export const getRevenueAnalytics = async ({ dateFrom, dateTo }) => {
  const params = [];
  const conditions = [`o.delivery_status = 'delivered'`];
  addPeriodFilters({ dateFrom, dateTo }, params, conditions, 'o.created_at');

  const result = await query(
    `SELECT
       s.id AS store_id,
       s.name AS store_name,
       COUNT(o.id)::int AS orders_count,
       COALESCE(SUM(o.final_total), 0)::numeric AS gmv,
       COALESCE(SUM(o.delivery_fee), 0)::numeric AS delivery_fee_total,
       COALESCE(SUM(o.discount_total), 0)::numeric AS discount_total,
       COALESCE(AVG(o.final_total), 0)::numeric AS avg_order_value
     FROM stores s
     LEFT JOIN orders o ON o.store_id = s.id AND ${conditions.join(' AND ')}
     GROUP BY s.id
     ORDER BY s.name ASC`,
    params,
  );

  return result.rows;
};

export const getDeliveryAnalytics = async ({ dateFrom, dateTo }) => {
  const params = [];
  const joinConditions = ['o.store_id = s.id'];
  addPeriodFilters({ dateFrom, dateTo }, params, joinConditions, 'o.created_at');

  const result = await query(
    `SELECT
       s.id AS store_id,
       s.name AS store_name,
       COUNT(o.id)::int AS totals,
       COUNT(o.id) FILTER (WHERE o.delivery_status = 'delivered')::int AS delivered,
       COUNT(o.id) FILTER (WHERE o.delivery_status = 'failed')::int AS failed,
       COALESCE(
         AVG(EXTRACT(EPOCH FROM (o.delivered_at - o.created_at)) / 60)
           FILTER (WHERE o.delivery_status = 'delivered' AND o.delivered_at IS NOT NULL),
         0
       )::numeric AS avg_delivery_minutes,
       COUNT(o.id) FILTER (WHERE o.fulfillment_window = 'next_morning')::int AS next_morning_orders
     FROM stores s
     LEFT JOIN orders o ON ${joinConditions.join(' AND ')}
     GROUP BY s.id
     ORDER BY s.name ASC`,
    params,
  );

  return result.rows;
};

export const getStoreReport = async ({ storeId, dateFrom, dateTo }) => {
  const storeResult = await query(
    `SELECT *
     FROM stores
     WHERE id = $1`,
    [storeId],
  );
  const store = storeResult.rows[0] || null;

  if (!store) {
    return { store: null };
  }

  const subscriberResult = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE subscription_status = 'active')::int AS active
     FROM customers
     WHERE store_id = $1`,
    [storeId],
  );

  const params = [storeId];
  const conditions = ['store_id = $1'];
  addPeriodFilters({ dateFrom, dateTo }, params, conditions, 'created_at');

  const orderResult = await query(
    `SELECT
       COUNT(*)::int AS totals,
       COUNT(*) FILTER (WHERE delivery_status = 'delivered')::int AS delivered,
       COUNT(*) FILTER (WHERE delivery_status = 'failed')::int AS failed,
       COALESCE(SUM(final_total) FILTER (WHERE delivery_status = 'delivered'), 0)::numeric AS gmv,
       COALESCE(SUM(final_total - pos_terminal_topup) FILTER (WHERE delivery_status = 'delivered'), 0)::numeric AS online_part,
       COALESCE(SUM(pos_terminal_topup) FILTER (WHERE delivery_status = 'delivered'), 0)::numeric AS pos_part,
       COALESCE(AVG(final_total) FILTER (WHERE delivery_status = 'delivered'), 0)::numeric AS avg
     FROM orders
     WHERE ${conditions.join(' AND ')}`,
    params,
  );

  return {
    store,
    subscribers: subscriberResult.rows[0],
    orders: orderResult.rows[0],
  };
};

export const exportOrderRows = async ({ storeId, status, dateFrom, dateTo }) => {
  const params = [];
  const whereClause = orderWhere({ storeId, status, dateFrom, dateTo }, params);
  const result = await query(
    `SELECT
       o.id,
       o.order_number,
       o.store_id,
       s.name AS store_name,
       o.customer_id,
       c.name AS customer_name,
       c.phone AS customer_phone,
       o.subtotal,
       o.discount_total,
       o.delivery_fee,
       o.online_payment_amount,
       o.online_capture_amount,
       o.pos_terminal_topup,
       o.final_total,
       o.fulfillment_window,
       o.payment_status,
       o.delivery_status,
       o.delivery_date,
       o.created_at
     FROM orders o
     JOIN stores s ON s.id = o.store_id
     JOIN customers c ON c.id = o.customer_id
     ${whereClause}
     ORDER BY o.created_at DESC`,
    params,
  );

  return result.rows;
};

export const listPromoCodeUsage = async (promoCodeId) => {
  const result = await query(
    `SELECT
       pcu.*,
       c.name AS customer_name,
       c.phone AS customer_phone,
       o.order_number,
       o.final_total,
       o.delivery_status,
       o.payment_status
     FROM promo_code_usage pcu
     JOIN customers c ON c.id = pcu.customer_id
     LEFT JOIN orders o ON o.id = pcu.order_id
     WHERE pcu.promo_code_id = $1
     ORDER BY pcu.used_at DESC`,
    [promoCodeId],
  );

  return result.rows;
};

export const listFirstOrderDiscounts = async () => {
  const result = await query(
    `SELECT
       fod.*,
       c.name AS customer_name,
       c.phone AS customer_phone,
       c.email AS customer_email,
       c.store_id
     FROM first_order_discounts fod
     JOIN customers c ON c.id = fod.customer_id
     ORDER BY fod.created_at DESC`,
  );

  return result.rows;
};
