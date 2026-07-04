import { pool } from '../../config/db.js';

export const withOperatorTransaction = async (callback) => {
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

export const findOperatorOrders = async ({ storeId, status }) => {
  const queryParams = [storeId];
  let statusFilter = '';

  if (status) {
    queryParams.push(status);
    statusFilter = 'AND orders.status = $2';
  }

  const result = await pool.query(
    `SELECT
       orders.id,
       orders.store_id,
       orders.customer_id,
       orders.status,
       orders.payment_method,
       orders.total_price,
       orders.created_at,
       users.name AS customer_name,
       users.phone AS customer_phone,
       COUNT(order_items.id)::INT AS items_count
     FROM orders
     INNER JOIN users ON users.id = orders.customer_id
     LEFT JOIN order_items ON order_items.order_id = orders.id
     WHERE orders.store_id = $1
     ${statusFilter}
     GROUP BY orders.id, users.name, users.phone
     ORDER BY orders.created_at DESC`,
    queryParams,
  );

  return result.rows;
};

export const findOrderForUpdate = async (client, orderId) => {
  const result = await client.query(
    `SELECT id, store_id, payment_method, status
     FROM orders
     WHERE id = $1
     FOR UPDATE`,
    [orderId],
  );

  return result.rows[0] || null;
};

export const updateOrderItemActualWeight = async ({
  client,
  orderId,
  itemId,
  actualWeight,
}) => {
  const result = await client.query(
    `UPDATE order_items
     SET actual_weight = $1
     WHERE id = $2 AND order_id = $3
     RETURNING id`,
    [actualWeight, itemId, orderId],
  );

  return result.rows[0] || null;
};

export const findOrderItemsForPricing = async (client, orderId) => {
  const result = await client.query(
    `SELECT
       order_items.id,
       order_items.quantity,
       order_items.estimated_weight,
       order_items.actual_weight,
       order_items.price_per_unit,
       products.is_weighted
     FROM order_items
     INNER JOIN products ON products.id = order_items.product_id
     WHERE order_items.order_id = $1`,
    [orderId],
  );

  return result.rows;
};

export const markOrderPicked = async ({ client, orderId, totalPrice }) => {
  const result = await client.query(
    `UPDATE orders
     SET status = 'picked',
         total_price = $1
     WHERE id = $2
     RETURNING id, store_id, customer_id, status, payment_method, total_price, created_at`,
    [totalPrice, orderId],
  );

  return result.rows[0];
};
