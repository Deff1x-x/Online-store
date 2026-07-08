import { query } from '../../config/db.js';

export const findCustomerByUserId = async (userId) => {
  const result = await query(
    `SELECT id, store_id
     FROM customers
     WHERE user_id = $1`,
    [userId],
  );

  return result.rows[0] || null;
};

export const findPromoCodeByCode = async (code) => {
  const result = await query(
    `SELECT *
     FROM promo_codes
     WHERE code = upper($1)`,
    [code],
  );

  return result.rows[0] || null;
};

export const countPromoCodeUses = async (promoCodeId) => {
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM promo_code_usage
     WHERE promo_code_id = $1`,
    [promoCodeId],
  );

  return result.rows[0].count;
};

export const countPromoCodeUsesByCustomer = async ({ promoCodeId, customerId }) => {
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM promo_code_usage
     WHERE promo_code_id = $1
       AND customer_id = $2`,
    [promoCodeId, customerId],
  );

  return result.rows[0].count;
};

export const listPromoCodes = async ({ storeId }) => {
  const params = [];
  const conditions = [];

  if (storeId) {
    params.push(storeId);
    conditions.push(`store_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT *
     FROM promo_codes
     ${whereClause}
     ORDER BY created_at DESC`,
    params,
  );

  return result.rows;
};

export const insertPromoCode = async ({
  storeId,
  code,
  discountType,
  discountValue,
  minOrderValue,
  maxUses,
  usagePerCustomer,
  validFrom,
  validUntil,
  isActive,
}) => {
  const result = await query(
    `INSERT INTO promo_codes (
       store_id,
       code,
       discount_type,
       discount_value,
       min_order_value,
       max_uses,
       usage_per_customer,
       valid_from,
       valid_until,
       is_active
     )
     VALUES ($1, upper($2), $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      storeId,
      code,
      discountType,
      discountValue,
      minOrderValue,
      maxUses,
      usagePerCustomer,
      validFrom,
      validUntil,
      isActive,
    ],
  );

  return result.rows[0];
};
