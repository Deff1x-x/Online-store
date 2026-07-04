import { query } from '../../config/db.js';

export const findStoreById = async (storeId) => {
  const result = await query(
    `SELECT id, status
     FROM stores
     WHERE id = $1`,
    [storeId],
  );

  return result.rows[0] || null;
};

export const findActiveCoverageByStoreId = async (storeId) => {
  const result = await query(
    `SELECT
       id,
       store_id,
       address,
       entrance_count,
       active
     FROM store_coverage
     WHERE store_id = $1 AND active = TRUE
     ORDER BY address ASC`,
    [storeId],
  );

  return result.rows;
};
