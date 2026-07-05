export const countCustomerStoreOrders = async (client, { customerRecordId, storeId, userId }) => {
  const result = await client.query(
    `SELECT COUNT(*)::INT AS order_count
     FROM orders
     WHERE store_id = $2
       AND (
         customer_record_id = $1
         OR customer_id = $3
       )`,
    [customerRecordId, storeId, userId],
  );

  return result.rows[0]?.order_count || 0;
};

export const findUnusedFirstOrderDiscount = async (client, { customerRecordId, storeId }) => {
  const result = await client.query(
    `SELECT
       id,
       store_id,
       customer_id,
       discount_type,
       discount_value,
       is_used
     FROM first_order_discounts
     WHERE customer_id = $1
       AND store_id = $2
       AND is_used = FALSE
     LIMIT 1
     FOR UPDATE`,
    [customerRecordId, storeId],
  );

  return result.rows[0] || null;
};

export const markFirstOrderDiscountUsed = async (client, { discountId, orderId }) => {
  const result = await client.query(
    `UPDATE first_order_discounts
     SET is_used = TRUE,
         applied_at = NOW(),
         order_id = $2
     WHERE id = $1
     RETURNING
       id,
       store_id,
       customer_id,
       discount_type,
       discount_value,
       applied_at,
       order_id,
       is_used`,
    [discountId, orderId],
  );

  return result.rows[0] || null;
};

export const findFirstOrderDiscountForOrder = async (client, orderId) => {
  const result = await client.query(
    `SELECT
       id,
       store_id,
       customer_id,
       discount_type,
       discount_value,
       applied_at,
       order_id,
       is_used
     FROM first_order_discounts
     WHERE order_id = $1
       AND is_used = TRUE
     LIMIT 1`,
    [orderId],
  );

  return result.rows[0] || null;
};
