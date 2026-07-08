import { pool, query } from '../../../config/db.js';

export const withTransaction = async (callback) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listStores = async () => {
  const result = await query(
    `SELECT
       s.*,
       row_to_json(ds.*) AS delivery_settings,
       COUNT(DISTINCT sc.id)::int AS coverage_count,
       COUNT(DISTINCT c.id)::int AS subscribers_count
     FROM stores s
     LEFT JOIN delivery_settings ds ON ds.store_id = s.id
     LEFT JOIN store_coverage sc ON sc.store_id = s.id AND sc.active = TRUE
     LEFT JOIN customers c ON c.store_id = s.id AND c.subscription_status = 'active'
     GROUP BY s.id, ds.id
     ORDER BY s.created_at DESC`,
  );

  return result.rows;
};

export const insertStoreWithDefaults = async (client, {
  name,
  address,
  location,
  operatingHours,
  deliveryTimeMin,
  deliveryTimeMax,
  status,
}) => {
  const storeResult = await client.query(
    `INSERT INTO stores (
       name,
       address,
       location,
       operating_hours,
       delivery_time_min,
       delivery_time_max,
       status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [name, address, location, operatingHours, deliveryTimeMin, deliveryTimeMax, status],
  );

  await client.query(
    `INSERT INTO delivery_settings (
       store_id,
       min_order_value_for_free_delivery,
       delivery_fee,
       ordering_open_hour,
       ordering_close_hour
     )
     VALUES ($1, 5000.00, 500.00, 11, 20)`,
    [storeResult.rows[0].id],
  );

  return storeResult.rows[0];
};

const updateById = async ({ table, id, fields, returning = '*' }) => {
  const keys = Object.keys(fields);

  if (keys.length === 0) {
    const result = await query(`SELECT ${returning} FROM ${table} WHERE id = $1`, [id]);
    return result.rows[0] || null;
  }

  const params = [id];
  const setClauses = keys.map((key) => {
    params.push(fields[key]);
    return `${key} = $${params.length}`;
  });
  setClauses.push('updated_at = NOW()');

  const result = await query(
    `UPDATE ${table}
     SET ${setClauses.join(', ')}
     WHERE id = $1
     RETURNING ${returning}`,
    params,
  );

  return result.rows[0] || null;
};

export const updateStoreById = (id, fields) => updateById({ table: 'stores', id, fields });

export const softDeleteStoreById = async (id) => {
  const result = await query(
    `UPDATE stores
     SET status = 'inactive',
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id],
  );

  return result.rows[0] || null;
};

export const upsertCoverage = async ({ storeId, address, entranceCount }) => {
  const result = await query(
    `INSERT INTO store_coverage (store_id, address, entrance_count, active)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (store_id, address)
     DO UPDATE SET
       entrance_count = EXCLUDED.entrance_count,
       active = TRUE,
       updated_at = NOW()
     RETURNING (xmax = 0) AS created, *`,
    [storeId, address, entranceCount],
  );

  return result.rows[0];
};

export const listProducts = async () => {
  const result = await query(
    `SELECT *
     FROM products
     ORDER BY created_at DESC`,
  );

  return result.rows;
};

export const insertProduct = async ({
  name,
  category,
  unit,
  pricePerUnit,
  companyPrice,
  isWeighted,
  isActive,
}) => {
  const result = await query(
    `INSERT INTO products (
       name,
       category,
       unit,
       price_per_unit,
       company_price,
       is_weighted,
       is_active
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [name, category, unit, pricePerUnit, companyPrice, isWeighted, isActive],
  );

  return result.rows[0];
};

export const updateProductById = (id, fields) => updateById({ table: 'products', id, fields });

export const softDeleteProductById = async (id) => {
  const result = await query(
    `UPDATE products
     SET is_active = FALSE,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id],
  );

  return result.rows[0] || null;
};

export const listStoreInventory = async (storeId) => {
  const result = await query(
    `SELECT
       si.id,
       si.store_id,
       si.product_id,
       p.name,
       p.category,
       p.unit,
       p.is_weighted,
       p.price_per_unit,
       p.company_price,
       si.selling_price,
       COALESCE(si.selling_price, p.price_per_unit) AS effective_price,
       si.quantity,
       si.stock_quantity,
       si.is_visible,
       si.status,
       si.last_delivery_date
     FROM store_inventory si
     JOIN products p ON p.id = si.product_id
     WHERE si.store_id = $1
     ORDER BY p.category, p.name`,
    [storeId],
  );

  return result.rows;
};

export const upsertStoreInventory = async ({
  storeId,
  productId,
  sellingPrice,
  quantity,
  stockQuantity,
  isVisible,
  status,
}) => {
  const result = await query(
    `INSERT INTO store_inventory (
       store_id,
       product_id,
       selling_price,
       quantity,
       stock_quantity,
       is_visible,
       status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (store_id, product_id)
     DO UPDATE SET
       selling_price = EXCLUDED.selling_price,
       quantity = EXCLUDED.quantity,
       stock_quantity = EXCLUDED.stock_quantity,
       is_visible = EXCLUDED.is_visible,
       status = EXCLUDED.status,
       updated_at = NOW()
     RETURNING *`,
    [storeId, productId, sellingPrice, quantity, stockQuantity, isVisible, status],
  );

  return result.rows[0];
};

export const receiveStoreInventory = async ({ storeId, productId, quantity }) => {
  const result = await query(
    `UPDATE store_inventory
     SET quantity = quantity + $3::numeric,
         stock_quantity = stock_quantity + CEIL($3::numeric)::int,
         status = 'available',
         last_delivery_date = NOW(),
         updated_at = NOW()
     WHERE store_id = $1
       AND product_id = $2
     RETURNING *`,
    [storeId, productId, quantity],
  );

  return result.rows[0] || null;
};

export const listPromoCodes = async () => {
  const result = await query(
    `SELECT *
     FROM promo_codes
     ORDER BY created_at DESC`,
  );

  return result.rows;
};

export const insertPromoCode = async (fields) => {
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
      fields.store_id,
      fields.code,
      fields.discount_type,
      fields.discount_value,
      fields.min_order_value,
      fields.max_uses,
      fields.usage_per_customer,
      fields.valid_from,
      fields.valid_until,
      fields.is_active,
    ],
  );

  return result.rows[0];
};

export const updatePromoCodeById = (id, fields) => updateById({ table: 'promo_codes', id, fields });

export const softDeletePromoCodeById = async (id) => {
  const result = await query(
    `UPDATE promo_codes
     SET is_active = FALSE,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id],
  );

  return result.rows[0] || null;
};

export const findDeliverySettings = async (storeId) => {
  const result = await query(
    `SELECT *
     FROM delivery_settings
     WHERE store_id = $1`,
    [storeId],
  );

  return result.rows[0] || null;
};

export const upsertDeliverySettings = async ({
  storeId,
  minOrderValueForFreeDelivery,
  deliveryFee,
  orderingOpenHour,
  orderingCloseHour,
}) => {
  const result = await query(
    `INSERT INTO delivery_settings (
       store_id,
       min_order_value_for_free_delivery,
       delivery_fee,
       ordering_open_hour,
       ordering_close_hour
     )
     VALUES (
       $1,
       COALESCE($2, 5000.00),
       COALESCE($3, 500.00),
       COALESCE($4, 11),
       COALESCE($5, 20)
     )
     ON CONFLICT (store_id)
     DO UPDATE SET
       min_order_value_for_free_delivery = COALESCE($2, delivery_settings.min_order_value_for_free_delivery),
       delivery_fee = COALESCE($3, delivery_settings.delivery_fee),
       ordering_open_hour = COALESCE($4, delivery_settings.ordering_open_hour),
       ordering_close_hour = COALESCE($5, delivery_settings.ordering_close_hour),
       updated_at = NOW()
     RETURNING *`,
    [storeId, minOrderValueForFreeDelivery, deliveryFee, orderingOpenHour, orderingCloseHour],
  );

  return result.rows[0];
};
