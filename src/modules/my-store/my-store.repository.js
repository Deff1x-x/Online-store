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

const orderSelect = `
  SELECT
    o.*,
    jsonb_build_object(
      'id', ca.id,
      'coverage_address', sc.address,
      'entrance', ca.entrance,
      'floor', ca.floor,
      'apartment', ca.apartment,
      'entrance_code', ca.entrance_code
    ) AS delivery_address,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'product_id', oi.product_id,
          'name', p.name,
          'quantity', oi.quantity,
          'price_per_unit', oi.price_per_unit,
          'line_total', oi.line_total,
          'estimated_weight', oi.estimated_weight
        )
        ORDER BY p.name
      ) FILTER (WHERE oi.id IS NOT NULL),
      '[]'::jsonb
    ) AS items
  FROM orders o
  LEFT JOIN customer_addresses ca ON ca.id = o.delivery_address_id
  LEFT JOIN store_coverage sc ON sc.id = ca.store_coverage_id
  LEFT JOIN order_items oi ON oi.order_id = o.id
  LEFT JOIN products p ON p.id = oi.product_id
`;

const orderGroupBy = `
  GROUP BY o.id, ca.id, sc.address
`;

export const listOrdersForStore = async ({ storeId, status }) => {
  const params = [storeId];
  const conditions = ['o.store_id = $1'];

  if (status) {
    params.push(status);
    conditions.push(`o.delivery_status = $${params.length}`);
  }

  const result = await query(
    `${orderSelect}
     WHERE ${conditions.join(' AND ')}
     ${orderGroupBy}
     ORDER BY o.created_at DESC`,
    params,
  );

  return result.rows;
};

export const findOrderForStore = async (client, { storeId, orderId }) => {
  const result = await client.query(
    `SELECT *
     FROM orders
     WHERE id = $1
       AND store_id = $2
     FOR UPDATE`,
    [orderId, storeId],
  );

  return result.rows[0] || null;
};

export const findOrderDetailsForStore = async ({ storeId, orderId }) => {
  const result = await query(
    `${orderSelect}
     WHERE o.id = $1
       AND o.store_id = $2
     ${orderGroupBy}`,
    [orderId, storeId],
  );

  return result.rows[0] || null;
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

export const updateActualWeight = async (client, {
  orderId,
  actualWeight,
  finalTotal,
  capture,
  posTopup,
}) => {
  const result = await client.query(
    `UPDATE orders
     SET actual_weight = $2,
         final_total = $3,
         total_price = $3,
         online_capture_amount = $4,
         pos_terminal_topup = $5,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [orderId, actualWeight, finalTotal, capture, posTopup],
  );

  return result.rows[0];
};

export const insertStatusHistory = async (client, {
  orderId,
  oldStatus,
  newStatus,
  userId,
}) => {
  await client.query(
    `INSERT INTO order_status_history (
       order_id,
       old_status,
       new_status,
       changed_by
     )
     VALUES ($1, $2, $3, $4)`,
    [orderId, oldStatus, newStatus, userId],
  );
};

export const returnOrderInventory = async (client, orderId) => {
  await client.query(
    `UPDATE store_inventory si
     SET quantity = si.quantity + returned.quantity,
         stock_quantity = si.stock_quantity + returned.stock_quantity,
         status = 'available',
         updated_at = NOW()
     FROM (
       SELECT
         oi.product_id,
         SUM(oi.quantity) AS quantity,
         SUM(CEIL(oi.quantity)::int) AS stock_quantity
       FROM order_items oi
       WHERE oi.order_id = $1
       GROUP BY oi.product_id
     ) returned
     JOIN orders o ON o.id = $1
     WHERE si.store_id = o.store_id
       AND si.product_id = returned.product_id`,
    [orderId],
  );
};

export const completeDeliveredOrder = async (client, { order, userId }) => {
  if (Number(order.pos_terminal_topup) > 0) {
    await client.query(
      `INSERT INTO payments (
         order_id,
         method,
         amount,
         status,
         provider_payload
       )
       VALUES (
         $1,
         'pos_terminal',
         $2,
         'completed',
         jsonb_build_object('source', 'courier_pos', 'confirmed_by', $3::text)
       )`,
      [order.id, order.pos_terminal_topup, userId],
    );
  }

  const result = await client.query(
    `UPDATE orders
     SET payment_status = 'fully_paid',
         delivered_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [order.id],
  );

  return result.rows[0];
};

export const listInventoryForStore = async (storeId) => {
  const result = await query(
    `SELECT
       p.id AS product_id,
       p.name,
       p.category,
       p.unit,
       p.is_weighted,
       p.price_per_unit,
       si.selling_price,
       COALESCE(si.selling_price, p.price_per_unit) AS effective_price,
       si.quantity,
       si.stock_quantity,
       si.is_visible,
       si.status,
       si.last_delivery_date
     FROM store_inventory si
     JOIN products p ON p.id = si.product_id
     WHERE si.store_id = $1
     ORDER BY p.category, p.name`,
    [storeId],
  );

  return result.rows;
};

export const updateInventoryForStore = async (client, {
  storeId,
  productId,
  patch,
}) => {
  const setClauses = ['updated_at = NOW()'];
  const params = [storeId, productId];

  if (Object.prototype.hasOwnProperty.call(patch, 'is_visible')) {
    params.push(patch.is_visible);
    setClauses.push(`is_visible = $${params.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'selling_price')) {
    params.push(patch.selling_price);
    setClauses.push(`selling_price = $${params.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'quantity')) {
    params.push(patch.quantity);
    setClauses.push(`quantity = $${params.length}`);
    setClauses.push(`stock_quantity = CEIL($${params.length}::numeric)::int`);
    setClauses.push(`status = CASE
      WHEN $${params.length}::numeric <= 0 THEN 'out_of_stock'
      WHEN $${params.length}::numeric <= 2 THEN 'low_stock'
      ELSE 'available'
    END`);
  }

  const result = await client.query(
    `UPDATE store_inventory
     SET ${setClauses.join(', ')}
     WHERE store_id = $1
       AND product_id = $2
     RETURNING
       id,
       store_id,
       product_id,
       quantity,
       stock_quantity,
       selling_price,
       is_visible,
       status,
       last_delivery_date`,
    params,
  );

  return result.rows[0] || null;
};

export const receiveInventoryForStore = async (client, {
  storeId,
  productId,
  quantity,
}) => {
  const result = await client.query(
    `UPDATE store_inventory
     SET quantity = quantity + $3::numeric,
         stock_quantity = stock_quantity + CEIL($3::numeric)::int,
         status = 'available',
         last_delivery_date = NOW(),
         updated_at = NOW()
     WHERE store_id = $1
       AND product_id = $2
     RETURNING
       id,
       store_id,
       product_id,
       quantity,
       stock_quantity,
       selling_price,
       is_visible,
       status,
       last_delivery_date`,
    [storeId, productId, quantity],
  );

  return result.rows[0] || null;
};

export const findInventoryForStore = async ({ storeId, productId }) => {
  const result = await query(
    `SELECT
       si.id,
       si.store_id,
       si.product_id,
       p.name,
       p.category,
       p.unit,
       p.is_weighted,
       p.price_per_unit,
       si.selling_price,
       COALESCE(si.selling_price, p.price_per_unit) AS effective_price,
       si.quantity,
       si.stock_quantity,
       si.is_visible,
       si.status,
       si.last_delivery_date
     FROM store_inventory si
     JOIN products p ON p.id = si.product_id
     WHERE si.store_id = $1
       AND si.product_id = $2`,
    [storeId, productId],
  );

  return result.rows[0] || null;
};

export const getAnalyticsForStore = async ({ storeId, dateFrom, dateTo }) => {
  const [funnelResult, moneyResult, inventoryResult] = await Promise.all([
    query(
      `SELECT delivery_status, COUNT(*)::int AS count
       FROM orders
       WHERE store_id = $1
         AND created_at::date BETWEEN $2::date AND $3::date
       GROUP BY delivery_status`,
      [storeId, dateFrom, dateTo],
    ),
    query(
      `SELECT
         COALESCE(SUM(final_total) FILTER (WHERE delivery_status = 'delivered'), 0)::numeric AS gmv_delivered,
         COALESCE(SUM(pos_terminal_topup) FILTER (WHERE delivery_status = 'delivered'), 0)::numeric AS pos_collected,
         COALESCE(AVG(final_total) FILTER (WHERE delivery_status = 'delivered'), 0)::numeric AS avg_order_value
       FROM orders
       WHERE store_id = $1
         AND created_at::date BETWEEN $2::date AND $3::date`,
      [storeId, dateFrom, dateTo],
    ),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE is_visible = FALSE)::int AS stopped_items,
         COUNT(*) FILTER (WHERE status = 'out_of_stock')::int AS out_of_stock,
         COUNT(*) FILTER (WHERE status = 'low_stock')::int AS low_stock
       FROM store_inventory
       WHERE store_id = $1`,
      [storeId],
    ),
  ]);

  return {
    funnel: funnelResult.rows.reduce((accumulator, row) => {
      accumulator[row.delivery_status] = row.count;
      return accumulator;
    }, {}),
    ...moneyResult.rows[0],
    ...inventoryResult.rows[0],
  };
};
