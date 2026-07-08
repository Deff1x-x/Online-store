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

export const findCustomerForOrder = async (client, userId) => {
  const result = await client.query(
    `SELECT
       c.id,
       c.user_id,
       c.store_id,
       c.subscription_status,
       c.subscription_end_date
     FROM customers c
     WHERE c.user_id = $1
     FOR UPDATE`,
    [userId],
  );

  return result.rows[0] || null;
};

export const findDeliveryAddressForCustomer = async (client, { addressId, customerId, storeId }) => {
  const result = await client.query(
    `SELECT ca.id
     FROM customer_addresses ca
     JOIN store_coverage sc ON sc.id = ca.store_coverage_id
     WHERE ca.id = $1
       AND ca.customer_id = $2
       AND sc.store_id = $3`,
    [addressId, customerId, storeId],
  );

  return result.rows[0] || null;
};

export const findStoreProductForOrder = async (client, { storeId, productId }) => {
  const result = await client.query(
    `SELECT
       p.id AS product_id,
       p.name,
       p.is_weighted,
       p.is_active,
       p.price_per_unit,
       si.id AS inventory_id,
       si.quantity,
       si.selling_price,
       si.is_visible,
       COALESCE(si.selling_price, p.price_per_unit) AS effective_price
     FROM products p
     JOIN store_inventory si ON si.product_id = p.id
     WHERE p.id = $1
       AND si.store_id = $2`,
    [productId, storeId],
  );

  return result.rows[0] || null;
};

export const reserveInventory = async (client, { inventoryId, quantity }) => {
  const result = await client.query(
    `UPDATE store_inventory
     SET
       quantity = quantity - $2::numeric,
       stock_quantity = GREATEST(0, stock_quantity - CEIL($2::numeric)::int),
       status = CASE
         WHEN quantity - $2::numeric <= 0 THEN 'out_of_stock'
         WHEN quantity - $2::numeric <= 2 THEN 'low_stock'
         ELSE status
       END,
       updated_at = NOW()
     WHERE id = $1
       AND quantity >= $2::numeric
     RETURNING id`,
    [inventoryId, quantity],
  );

  return result.rows[0] || null;
};

export const findFirstOrderDiscount = async (client, customerId) => {
  const result = await client.query(
    `SELECT id, amount, is_used
     FROM first_order_discounts
     WHERE customer_id = $1
     FOR UPDATE`,
    [customerId],
  );

  return result.rows[0] || null;
};

export const findPromoCodeForOrder = async (client, code) => {
  const result = await client.query(
    `SELECT *
     FROM promo_codes
     WHERE lower(code) = lower($1)
     FOR UPDATE`,
    [code],
  );

  return result.rows[0] || null;
};

export const countPromoUses = async (client, promoCodeId) => {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM promo_code_usage
     WHERE promo_code_id = $1`,
    [promoCodeId],
  );

  return result.rows[0].count;
};

export const countPromoUsesByCustomer = async (client, { promoCodeId, customerId }) => {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM promo_code_usage
     WHERE promo_code_id = $1
       AND customer_id = $2`,
    [promoCodeId, customerId],
  );

  return result.rows[0].count;
};

export const findDeliverySettings = async (client, storeId) => {
  const result = await client.query(
    `SELECT
       min_order_value_for_free_delivery,
       delivery_fee,
       ordering_open_hour,
       ordering_close_hour
     FROM delivery_settings
     WHERE store_id = $1`,
    [storeId],
  );

  return result.rows[0] || null;
};

export const insertOrder = async (client, {
  orderNumber,
  storeId,
  customerId,
  deliveryAddressId,
  subtotal,
  discountTotal,
  deliveryFee,
  estimatedWeight,
  onlinePaymentAmount,
  posTerminalTopup,
  finalTotal,
  fulfillmentWindow,
  deliveryDate,
  deliveryTimeSlot,
}) => {
  const result = await client.query(
    `INSERT INTO orders (
       order_number,
       store_id,
       customer_id,
       delivery_address_id,
       subtotal,
       discount_total,
       delivery_fee,
       estimated_weight,
       online_payment_amount,
       pos_terminal_topup,
       final_total,
       total_price,
       fulfillment_window,
       delivery_date,
       delivery_time_slot,
       delivery_status,
       payment_status
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $11, $12, $13, $14, 'new', 'pending'
     )
     RETURNING *`,
    [
      orderNumber,
      storeId,
      customerId,
      deliveryAddressId,
      subtotal,
      discountTotal,
      deliveryFee,
      estimatedWeight,
      onlinePaymentAmount,
      posTerminalTopup,
      finalTotal,
      fulfillmentWindow,
      deliveryDate,
      deliveryTimeSlot,
    ],
  );

  return result.rows[0];
};

export const insertOrderItem = async (client, {
  orderId,
  productId,
  quantity,
  pricePerUnit,
  lineTotal,
  estimatedWeight,
}) => {
  const result = await client.query(
    `INSERT INTO order_items (
       order_id,
       product_id,
       quantity,
       price_per_unit,
       line_total,
       estimated_weight
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [orderId, productId, quantity, pricePerUnit, lineTotal, estimatedWeight],
  );

  return result.rows[0];
};

export const insertOrderStatusHistory = async (client, { orderId, userId }) => {
  await client.query(
    `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
     VALUES ($1, NULL, 'new', $2)`,
    [orderId, userId],
  );
};

export const markFirstOrderDiscountUsed = async (client, { discountId, orderId }) => {
  await client.query(
    `UPDATE first_order_discounts
     SET is_used = TRUE,
         order_id = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [discountId, orderId],
  );
};

export const insertPromoCodeUsage = async (client, {
  promoCodeId,
  customerId,
  orderId,
  discountAmount,
}) => {
  await client.query(
    `INSERT INTO promo_code_usage (
       promo_code_id,
       customer_id,
       order_id,
       discount_amount
     )
     VALUES ($1, $2, $3, $4)`,
    [promoCodeId, customerId, orderId, discountAmount],
  );
};

export const findOrdersByCustomer = async ({ customerId }) => {
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
       delivery_status AS status,
       delivery_status,
       payment_status,
       fulfillment_window,
       delivery_date,
       created_at
     FROM orders
     WHERE customer_id = $1
     ORDER BY created_at DESC`,
    [customerId],
  );

  return result.rows;
};

export const findOrderByCustomer = async ({ customerId, orderId }) => {
  const orderResult = await query(
    `SELECT *
     FROM orders
     WHERE id = $1
       AND customer_id = $2`,
    [orderId, customerId],
  );

  if (orderResult.rowCount === 0) {
    return null;
  }

  const itemsResult = await query(
    `SELECT
       oi.product_id,
       p.name,
       oi.quantity,
       oi.price_per_unit,
       oi.line_total,
       oi.estimated_weight
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY p.name ASC`,
    [orderId],
  );

  return {
    ...orderResult.rows[0],
    items: itemsResult.rows,
  };
};

export const findCustomerIdByUserId = async (userId) => {
  const result = await query(
    `SELECT id
     FROM customers
     WHERE user_id = $1`,
    [userId],
  );

  return result.rows[0]?.id || null;
};
