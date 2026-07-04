import { pool, query } from '../../config/db.js';

export const findCoverageById = async (coverageId) => {
  const result = await query(
    `SELECT
       id,
       store_id,
       address,
       entrance_count,
       active
     FROM store_coverage
     WHERE id = $1
     LIMIT 1`,
    [coverageId],
  );

  return result.rows[0] || null;
};

export const findAddressesByCustomerId = async (customerId) => {
  const result = await query(
    `SELECT
       customer_addresses.id,
       customer_addresses.customer_id AS customer_record_id,
       customer_addresses.store_coverage_id,
       store_coverage.store_id,
       store_coverage.address AS coverage_address,
       store_coverage.entrance_count,
       customer_addresses.entrance,
       customer_addresses.floor,
       customer_addresses.apartment,
       customer_addresses.entrance_code,
       customer_addresses.is_default,
       customer_addresses.created_at
     FROM customer_addresses
     INNER JOIN store_coverage ON store_coverage.id = customer_addresses.store_coverage_id
     WHERE customer_addresses.customer_id = $1
     ORDER BY customer_addresses.is_default DESC, customer_addresses.created_at DESC`,
    [customerId],
  );

  return result.rows;
};

export const createCustomerAddress = async ({
  customerId,
  storeCoverageId,
  entrance,
  floor,
  apartment,
  entranceCode,
  isDefault,
}) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (isDefault === true) {
      await client.query(
        `UPDATE customer_addresses
         SET is_default = FALSE
         WHERE customer_id = $1`,
        [customerId],
      );
    }

    const result = await client.query(
      `INSERT INTO customer_addresses (
         customer_id,
         store_coverage_id,
         entrance,
         floor,
         apartment,
         entrance_code,
         is_default
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING
         id,
         customer_id AS customer_record_id,
         store_coverage_id,
         entrance,
         floor,
         apartment,
         entrance_code,
         is_default,
         created_at`,
      [
        customerId,
        storeCoverageId,
        entrance ?? null,
        floor ?? null,
        apartment ?? null,
        entranceCode || null,
        isDefault === true,
      ],
    );

    await client.query('COMMIT');

    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
