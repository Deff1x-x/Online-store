import { query } from '../../config/db.js';

export const createStore = async ({ name, address }) => {
  const result = await query(
    `INSERT INTO stores (name, address, status, settings)
     VALUES ($1, $2, 'active', '{}'::JSONB)
     RETURNING id, name, address, status, settings`,
    [name, address],
  );

  return result.rows[0];
};

export const findActiveStores = async () => {
  const result = await query(
    `SELECT id, name, address, status
     FROM stores
     WHERE status = 'active'
     ORDER BY name ASC`,
  );

  return result.rows;
};
