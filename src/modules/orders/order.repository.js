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
    `SELECT id, phone, email, name, store_id, role
     FROM users
     WHERE id = $1
       AND role::TEXT IN ('customer', 'Customer')`,
    [customerId],
  );

  return result.rows[0] || null;
};

export const findCustomerRecordForUser = async (client, user) => {
  const result = await client.query(
    `SELECT
       id,
       user_id,
       phone,
       store_id,
       name,
       email,
       subscription_status,
       subscription_start_date,
       subscription_end_date
     FROM customers
     WHERE user_id = $1
        OR (store_id = $2 AND phone = $3)
     ORDER BY (user_id = $1) DESC
     LIMIT 1`,
    [user.id, user.store_id, user.phone],
  );

  return result.rows[0] || null;
};

export const createCustomerRecordForUser = async (client, user) => {
  const result = await client.query(
    `INSERT INTO customers (
       user_id,
       phone,
       store_id,
       name,
       email,
       subscription_status
     )
     VALUES ($1, $2, $3, $4, $5, 'active')
     ON CONFLICT (store_id, phone)
     DO UPDATE SET
       user_id = COALESCE(customers.user_id, EXCLUDED.user_id),
       name = COALESCE(customers.name, EXCLUDED.name),
       email = COALESCE(customers.email, EXCLUDED.email),
       updated_at = NOW()
     RETURNING
       id,
       user_id,
       phone,
       store_id,
       name,
       email,
       subscription_status,
       subscription_start_date,
       subscription_end_date`,
    [user.id, user.phone, user.store_id, user.name || null, user.email || null],
  );

  return result.rows[0];
};

export const findDeliveryAddressForOrder = async ({ client, addressId, customerRecordId }) => {
  const result = await client.query(
    `SELECT
       customer_addresses.id,
       customer_addresses.customer_id AS customer_record_id,
       customer_addresses.store_coverage_id,
       store_coverage.store_id,
       store_coverage.active AS coverage_active
     FROM customer_addresses
     INNER JOIN store_coverage ON store_coverage.id = customer_addresses.store_coverage_id
     WHERE customer_addresses.id = $1
       AND customer_addresses.customer_id = $2
     LIMIT 1`,
    [addressId, customerRecordId],
  );

  return result.rows[0] || null;
};

export const findAvailableStoreProduct = async (client, productId, storeId) => {
  const result = await client.query(
    `SELECT
       products.id AS product_id,
       store_inventory.id AS inventory_id,
       products.price_per_unit,
       products.company_price,
       products.is_weighted,
       products.average_weight,
       COALESCE(products.avg_weight, products.average_weight) AS avg_weight,
       store_inventory.stock_quantity,
       store_inventory.quantity,
       COALESCE(store_inventory.selling_price, products.company_price, products.price_per_unit) AS selling_price,
       store_inventory.status
     FROM store_inventory
     INNER JOIN products ON products.id = store_inventory.product_id
     WHERE store_inventory.product_id = $1
       AND store_inventory.store_id = $2
       AND products.is_active = TRUE
       AND store_inventory.status = 'available'
     LIMIT 1`,
    [productId, storeId],
  );

  return result.rows[0] || null;
};

export const createOrderRecord = async ({
  client,
  orderNumber,
  storeId,
  customerId,
  customerRecordId,
  deliveryAddressId,
  paymentMethod,
  paymentStatus,
  deliveryStatus,
  subtotal,
  estimatedWeight,
  onlinePaymentAmount,
  finalTotal,
  totalPrice,
  deliveryDate,
  deliveryTimeSlot,
}) => {
  const result = await client.query(
    `INSERT INTO orders (
       order_number,
       store_id,
       customer_id,
       customer_record_id,
       delivery_address_id,
       payment_method,
       payment_status,
       status,
       delivery_status,
       subtotal,
       estimated_weight,
       online_payment_amount,
       final_total,
       total_price,
       delivery_date,
       delivery_time_slot
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING
       id,
       order_number,
       store_id,
       customer_id,
       customer_record_id,
       delivery_address_id,
       status,
       delivery_status,
       payment_method,
       payment_status,
       subtotal,
       estimated_weight,
       online_payment_amount,
       final_total,
       total_price,
       delivery_date,
       delivery_time_slot,
       created_at`,
    [
      orderNumber,
      storeId,
      customerId,
      customerRecordId,
      deliveryAddressId,
      paymentMethod,
      paymentStatus,
      deliveryStatus,
      subtotal,
      estimatedWeight,
      onlinePaymentAmount,
      finalTotal,
      totalPrice,
      deliveryDate || null,
      deliveryTimeSlot || null,
    ],
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
  lineTotal,
}) => {
  const result = await client.query(
    `INSERT INTO order_items (
       order_id,
       product_id,
       quantity,
       estimated_weight,
       actual_weight,
       price_per_unit,
       unit_price,
       line_total
     )
     VALUES ($1, $2, $3, $4, NULL, $5, $5, $6)
     RETURNING
       id,
       order_id,
       product_id,
       quantity,
       estimated_weight,
       price_per_unit,
       unit_price,
       line_total,
       created_at`,
    [orderId, productId, quantity, estimatedWeight, pricePerUnit, lineTotal],
  );

  return result.rows[0];
};
