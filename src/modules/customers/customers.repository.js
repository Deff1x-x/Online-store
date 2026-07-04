import { query } from '../../config/db.js';

export const findUserForCustomerRecord = async (userId) => {
  const result = await query(
    `SELECT id, phone, email, name, store_id, role
     FROM users
     WHERE id = $1`,
    [userId],
  );

  return result.rows[0] || null;
};

export const findCustomerByUserId = async (userId) => {
  const result = await query(
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
     LIMIT 1`,
    [userId],
  );

  return result.rows[0] || null;
};

export const findCustomerByStoreAndPhone = async ({ storeId, phone }) => {
  const result = await query(
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
     WHERE store_id = $1 AND phone = $2
     LIMIT 1`,
    [storeId, phone],
  );

  return result.rows[0] || null;
};

export const createCustomerRecord = async ({
  userId,
  phone,
  storeId,
  name,
  email,
}) => {
  const result = await query(
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
    [userId, phone, storeId, name || null, email || null],
  );

  return result.rows[0];
};
