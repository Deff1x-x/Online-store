import { query } from '../../config/db.js';

export const findCustomerRecordIdForUser = async (userId) => {
  const result = await query(
    `SELECT id
     FROM customers
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );

  return result.rows[0]?.id || null;
};

const orderSelect = `
  SELECT
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
    orders.online_payment_amount,
    orders.final_total,
    orders.total_price,
    orders.delivery_date,
    orders.delivery_time_slot,
    orders.created_at,
    COALESCE(
      (
        SELECT JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', order_items.id,
            'product_id', order_items.product_id,
            'name', products.name,
            'quantity', order_items.quantity,
            'estimated_weight', order_items.estimated_weight,
            'price_per_unit', order_items.price_per_unit,
            'unit_price', order_items.unit_price,
            'line_total', order_items.line_total,
            'created_at', order_items.created_at
          )
          ORDER BY order_items.created_at ASC
        )
        FROM order_items
        LEFT JOIN products ON products.id = order_items.product_id
        WHERE order_items.order_id = orders.id
      ),
      '[]'::JSON
    ) AS items
  FROM orders`;

export const findOrdersForCustomer = async ({ userId, customerRecordId }) => {
  const result = await query(
    `${orderSelect}
     WHERE orders.customer_id = $1
        OR ($2::UUID IS NOT NULL AND orders.customer_record_id = $2)
     ORDER BY orders.created_at DESC`,
    [userId, customerRecordId],
  );

  return result.rows;
};

export const findOrderForCustomerById = async ({ userId, customerRecordId, orderId }) => {
  const result = await query(
    `${orderSelect}
     WHERE orders.id = $1
       AND (
         orders.customer_id = $2
         OR ($3::UUID IS NOT NULL AND orders.customer_record_id = $3)
       )
     LIMIT 1`,
    [orderId, userId, customerRecordId],
  );

  return result.rows[0] || null;
};
