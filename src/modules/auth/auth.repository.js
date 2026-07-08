import { pool, query } from '../../config/db.js';
import { ROLES } from '../../utils/roles.js';

const customerUserSelect = `
  SELECT
    u.id,
    u.phone,
    u.email,
    u.name,
    u.store_id,
    u.role,
    c.id AS customer_id,
    c.subscription_status
  FROM users u
  LEFT JOIN customers c ON c.user_id = u.id
`;

export const createCustomerRegistration = async ({
  phone,
  name,
  storeId,
  privacyPolicy,
  termsOfService,
  ipAddress,
  userAgent,
}) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const storeResult = await client.query(
      `SELECT id
       FROM stores
       WHERE id = $1 AND status = 'active'
       FOR SHARE`,
      [storeId],
    );

    if (storeResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { storeNotFound: true };
    }

    const userResult = await client.query(
      `INSERT INTO users (phone, name, store_id, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, phone, email, name, store_id, role`,
      [phone, name, storeId, ROLES.customer],
    );

    const user = userResult.rows[0];

    const customerResult = await client.query(
      `INSERT INTO customers (
         user_id,
         store_id,
         name,
         phone,
         subscription_status,
         subscription_auto_renew
       )
       VALUES ($1, $2, $3, $4, 'expired', FALSE)
       RETURNING id AS customer_id, subscription_status`,
      [user.id, storeId, name, phone],
    );

    await client.query(
      `INSERT INTO first_order_discounts (customer_id, amount, is_used)
       VALUES ($1, 3000.00, FALSE)`,
      [customerResult.rows[0].customer_id],
    );

    await client.query(
      `INSERT INTO user_consents (
         user_id,
         privacy_policy,
         terms_of_service,
         ip_address,
         user_agent
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, privacyPolicy, termsOfService, ipAddress || null, userAgent || null],
    );

    await client.query('COMMIT');

    return {
      user: {
        ...user,
        customer_id: customerResult.rows[0].customer_id,
        subscription_status: customerResult.rows[0].subscription_status,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const findCustomerUserByPhone = async (phone) => {
  const result = await query(
    `${customerUserSelect}
     WHERE u.phone = $1`,
    [phone],
  );

  return result.rows[0] || null;
};

export const findStaffUserByEmail = async (email) => {
  const result = await query(
    `SELECT id, phone, email, name, store_id, password_hash, role
     FROM users
     WHERE email = $1 AND status = 'active'`,
    [email],
  );

  return result.rows[0] || null;
};

export const createUserSession = async ({
  userId,
  refreshTokenHash,
  userAgent,
  ipAddress,
  expiresAt,
}) => {
  const result = await query(
    `INSERT INTO user_sessions (
       user_id,
       refresh_token_hash,
       user_agent,
       ip_address,
       expires_at
     )
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, refreshTokenHash, userAgent || null, ipAddress || null, expiresAt],
  );

  return result.rows[0];
};

export const rotateRefreshSession = async ({
  refreshTokenHash,
  newRefreshTokenHash,
  userAgent,
  ipAddress,
  expiresAt,
}) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      `${customerUserSelect}
       JOIN user_sessions s ON s.user_id = u.id
       WHERE s.refresh_token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
       FOR UPDATE OF s`,
      [refreshTokenHash],
    );

    if (sessionResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const user = sessionResult.rows[0];

    await client.query(
      `UPDATE user_sessions
       SET revoked_at = NOW(),
           updated_at = NOW()
       WHERE refresh_token_hash = $1`,
      [refreshTokenHash],
    );

    await client.query(
      `INSERT INTO user_sessions (
         user_id,
         refresh_token_hash,
         user_agent,
         ip_address,
         expires_at
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, newRefreshTokenHash, userAgent || null, ipAddress || null, expiresAt],
    );

    await client.query('COMMIT');

    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
