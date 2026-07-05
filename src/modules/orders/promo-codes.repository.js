export const findPromoCodeForStore = async (client, { storeId, code, lock = false }) => {
  const result = await client.query(
    `SELECT
       id,
       store_id,
       code,
       discount_type,
       discount_value,
       min_order_value,
       max_uses,
       current_uses,
       usage_per_customer,
       valid_from,
       valid_until,
       is_active
     FROM promo_codes
     WHERE store_id = $1
       AND UPPER(code) = UPPER($2)
     LIMIT 1
     ${lock ? 'FOR UPDATE' : ''}`,
    [storeId, code],
  );

  return result.rows[0] || null;
};

export const countPromoCodeUsageForCustomer = async (client, { promoCodeId, customerRecordId }) => {
  const result = await client.query(
    `SELECT COUNT(*)::INT AS usage_count
     FROM promo_code_usage
     WHERE promo_code_id = $1
       AND customer_id = $2`,
    [promoCodeId, customerRecordId],
  );

  return result.rows[0]?.usage_count || 0;
};

export const createPromoCodeUsage = async (client, {
  promoCodeId,
  customerRecordId,
  orderId,
  discountAmount,
}) => {
  const result = await client.query(
    `INSERT INTO promo_code_usage (
       promo_code_id,
       customer_id,
       order_id,
       discount_amount
     )
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (promo_code_id, customer_id, order_id)
     DO NOTHING
     RETURNING
       id,
       promo_code_id,
       customer_id,
       order_id,
       discount_amount,
       used_at`,
    [promoCodeId, customerRecordId, orderId, discountAmount],
  );

  return result.rows[0] || null;
};

export const incrementPromoCodeUses = async (client, promoCodeId) => {
  const result = await client.query(
    `UPDATE promo_codes
     SET current_uses = current_uses + 1
     WHERE id = $1
     RETURNING id, current_uses`,
    [promoCodeId],
  );

  return result.rows[0] || null;
};
