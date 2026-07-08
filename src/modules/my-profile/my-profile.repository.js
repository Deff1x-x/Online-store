import { pool, query } from '../../config/db.js';

export const findProfileByUserId = async (userId) => {
  const result = await query(
    `SELECT
       jsonb_build_object(
         'id', u.id,
         'name', u.name,
         'phone', u.phone,
         'email', u.email
       ) AS "user",
       jsonb_build_object(
         'id', c.id,
         'user_id', c.user_id,
         'store_id', c.store_id,
         'name', c.name,
         'phone', c.phone,
         'email', c.email,
         'subscription_status', c.subscription_status,
         'subscription_start_date', c.subscription_start_date,
         'subscription_end_date', c.subscription_end_date,
         'subscription_auto_renew', c.subscription_auto_renew
       ) AS customer,
       c.subscription_status,
       c.subscription_start_date,
       c.subscription_end_date,
       c.subscription_auto_renew
     FROM users u
     JOIN customers c ON c.user_id = u.id
     WHERE u.id = $1`,
    [userId],
  );

  return result.rows[0] || null;
};

export const updateProfileForUser = async ({ userId, fields }) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const keys = Object.keys(fields);

    if (keys.length > 0) {
      const params = [userId];
      const setClauses = keys.map((key) => {
        params.push(fields[key]);
        return `${key} = $${params.length}`;
      });
      setClauses.push('updated_at = NOW()');

      await client.query(
        `UPDATE users
         SET ${setClauses.join(', ')}
         WHERE id = $1`,
        params,
      );

      await client.query(
        `UPDATE customers
         SET ${setClauses.join(', ')}
         WHERE user_id = $1`,
        params,
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
