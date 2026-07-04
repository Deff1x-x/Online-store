import { pool, query } from '../../config/db.js';
import { ROLES } from '../../utils/roles.js';

export const findActiveStoreById = async (storeId, client = { query }) => {
  const result = await client.query(
    `SELECT id
     FROM stores
     WHERE id = $1 AND status = 'active'`,
    [storeId],
  );

  return result.rows[0] || null;
};

export const createCustomerWithConsent = async ({
  phone,
  email,
  name,
  storeId,
  privacyPolicy,
  termsOfService,
  ipAddress,
}) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const store = await findActiveStoreById(storeId, client);

    if (!store) {
      await client.query('ROLLBACK');
      return { storeNotFound: true };
    }

    const userResult = await client.query(
      `INSERT INTO users (phone, email, name, store_id, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, phone, email, name, store_id, role`,
      [phone, email || null, name, storeId, ROLES.customer],
    );

    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO user_consents (user_id, privacy_policy, terms_of_service, ip)
       VALUES ($1, $2, $3, $4)`,
      [user.id, privacyPolicy, termsOfService, ipAddress],
    );

    await client.query('COMMIT');

    return { user };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const findUserByPhone = async (phone) => {
  const result = await query(
    `SELECT id, phone, email, name, store_id, role
     FROM users
     WHERE phone = $1`,
    [phone],
  );

  return result.rows[0] || null;
};

export const findUserByEmail = async (email) => {
  const result = await query(
    `SELECT id, phone, email, name, store_id, password_hash, role
     FROM users
     WHERE email = $1`,
    [email],
  );

  return result.rows[0] || null;
};
