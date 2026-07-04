import { pool } from '../../config/db.js';

export const withOrderTransaction = async (callback) => {
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

export const findCustomerById = async (client, customerId) => {
  const result = await client.query(
    `SELECT id, store_id, role
     FROM users
     WHERE id = $1 AND role::TEXT = 'customer'`,
    [customerId],
  );

  return result.rows[0] || null;
};

export const findActiveSubscription = async (client, userId, storeId) => {
  const result = await client.query(
    `SELECT id
     FROM subscriptions
     WHERE user_id = $1
       AND store_id = $2
       AND status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [userId, storeId],
  );

  return result.rows[0] || null;
};

export const findAvailableStoreProduct = async (client, productId, storeId) => {
  const result = await client.query(
    `SELECT
       products.id,
       products.price_per_unit,
       products.is_weighted,
       products.average_weight,
       store_inventory.stock_quantity,
       store_inventory.is_visible
     FROM products
     INNER JOIN store_inventory ON store_inventory.product_id = products.id
     WHERE products.id = $1
       AND store_inventory.store_id = $2
     LIMIT 1`,
    [productId, storeId],
  );

  return result.rows[0] || null;
};

export const createOrderRecord = async ({
  client,
  storeId,
  customerId,
  paymentMethod,
  totalPrice,
}) => {
  const result = await client.query(
    `INSERT INTO orders (store_id, customer_id, payment_method, total_price)
     VALUES ($1, $2, $3, $4)
     RETURNING id, store_id, customer_id, status, payment_method, total_price, created_at`,
    [storeId, customerId, paymentMethod, totalPrice],
  );

  return result.rows[0];
};

export const createOrderItem = async ({
  client,
  orderId,
  productId,
  quantity,
  estimatedWeight,
  pricePerUnit,
}) => {
  await client.query(
    `INSERT INTO order_items (
       order_id,
       product_id,
       quantity,
       estimated_weight,
       actual_weight,
       price_per_unit
     )
     VALUES ($1, $2, $3, $4, NULL, $5)`,
    [orderId, productId, quantity, estimatedWeight, pricePerUnit],
  );
};
