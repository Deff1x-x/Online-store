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

export const findOperatorOrders = async ({
  storeId,
  deliveryDate,
  deliveryStatus,
  paymentStatus,
}) => {
  const queryParams = [storeId];
  const filters = [];

  if (deliveryDate) {
    queryParams.push(deliveryDate);
    filters.push(`orders.delivery_date = $${queryParams.length}`);
  }

  if (deliveryStatus) {
    queryParams.push(deliveryStatus);
    filters.push(`orders.delivery_status = $${queryParams.length}`);
  }

  if (paymentStatus) {
    queryParams.push(paymentStatus);
    filters.push(`orders.payment_status = $${queryParams.length}`);
  }

  const result = await pool.query(
    `SELECT
       orders.id,
       orders.order_number,
       orders.store_id,
       orders.customer_id,
       orders.customer_record_id,
       orders.delivery_address_id,
       orders.status,
       orders.delivery_status,
       orders.payment_method,
       orders.payment_status,
       orders.subtotal,
       orders.estimated_weight,
       orders.actual_weight,
       orders.online_payment_amount,
       orders.final_total,
       orders.pos_terminal_topup,
       orders.total_price,
       orders.delivery_date,
       orders.delivery_time_slot,
       orders.created_at,
       JSON_BUILD_OBJECT(
         'id', users.id,
         'name', users.name,
         'phone', users.phone
       ) AS customer,
       CASE
         WHEN customer_addresses.id IS NULL THEN NULL
         ELSE JSON_BUILD_OBJECT(
           'id', customer_addresses.id,
           'store_coverage_id', customer_addresses.store_coverage_id,
           'coverage_address', store_coverage.address,
           'entrance', customer_addresses.entrance,
           'floor', customer_addresses.floor,
           'apartment', customer_addresses.apartment,
           'entrance_code', customer_addresses.entrance_code
         )
       END AS delivery_address,
       COALESCE(
         JSON_AGG(
           JSON_BUILD_OBJECT(
             'id', order_items.id,
             'product_id', order_items.product_id,
             'name', products.name,
             'quantity', order_items.quantity,
             'estimated_weight', order_items.estimated_weight,
             'actual_weight', order_items.actual_weight,
             'price_per_unit', order_items.price_per_unit,
             'unit_price', order_items.unit_price,
             'line_total', order_items.line_total,
             'created_at', order_items.created_at
           )
           ORDER BY order_items.created_at ASC
         ) FILTER (WHERE order_items.id IS NOT NULL),
         '[]'::JSON
       ) AS items
     FROM orders
     INNER JOIN users ON users.id = orders.customer_id
     LEFT JOIN order_items ON order_items.order_id = orders.id
     LEFT JOIN products ON products.id = order_items.product_id
     LEFT JOIN customer_addresses ON customer_addresses.id = orders.delivery_address_id
     LEFT JOIN store_coverage ON store_coverage.id = customer_addresses.store_coverage_id
     WHERE orders.store_id = $1
       ${filters.length > 0 ? `AND ${filters.join(' AND ')}` : ''}
     GROUP BY orders.id, users.id, users.name, users.phone, customer_addresses.id, store_coverage.address
     ORDER BY orders.created_at DESC`,
    queryParams,
  );

  return result.rows;
};

export const findOrderForUpdate = async (client, orderId) => {
  const result = await client.query(
    `SELECT
       id,
       store_id,
       payment_method,
       payment_status,
       status,
       delivery_status,
       subtotal,
       estimated_weight,
       actual_weight,
       online_payment_amount,
       final_total,
       pos_terminal_topup,
       total_price
     FROM orders
     WHERE id = $1
     FOR UPDATE`,
    [orderId],
  );

  return result.rows[0] || null;
};

export const updateOrderDeliveryStatus = async ({
  client,
  orderId,
  deliveryStatus,
}) => {
  const result = await client.query(
    `UPDATE orders
     SET delivery_status = $1,
         status = $1,
         delivered_at = CASE WHEN $1 = 'delivered' THEN NOW() ELSE delivered_at END,
         updated_at = NOW()
     WHERE id = $2
     RETURNING
       id,
       store_id,
       customer_id,
       status,
       delivery_status,
       payment_method,
       payment_status,
       subtotal,
       estimated_weight,
       actual_weight,
       online_payment_amount,
       final_total,
       pos_terminal_topup,
       total_price,
       delivery_date,
       delivery_time_slot,
       created_at`,
    [deliveryStatus, orderId],
  );

  return result.rows[0];
};

export const createOrderStatusHistory = async ({
  client,
  orderId,
  oldStatus,
  newStatus,
  changedBy,
}) => {
  await client.query(
    `INSERT INTO order_status_history (
       order_id,
       old_status,
       new_status,
       changed_by
     )
     VALUES ($1, $2, $3, $4)`,
    [orderId, oldStatus, newStatus, changedBy],
  );
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

export const updateOrderActualWeightAndTotals = async ({
  client,
  orderId,
  actualWeight,
  finalTotal,
  posTerminalTopup,
}) => {
  const result = await client.query(
    `UPDATE orders
     SET actual_weight = $1,
         final_total = $2,
         total_price = $2,
         pos_terminal_topup = $3,
         updated_at = NOW()
     WHERE id = $4
     RETURNING
       id,
       store_id,
       customer_id,
       status,
       delivery_status,
       payment_method,
       payment_status,
       subtotal,
       estimated_weight,
       actual_weight,
       online_payment_amount,
       final_total,
       pos_terminal_topup,
       total_price,
       delivery_date,
       delivery_time_slot,
       created_at`,
    [actualWeight, finalTotal, posTerminalTopup, orderId],
  );

  return result.rows[0];
};
