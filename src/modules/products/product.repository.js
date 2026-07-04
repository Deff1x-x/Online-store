import { query } from '../../config/db.js';

export const createProduct = async ({
  name,
  category,
  unit,
  price_per_unit,
  company_price,
  is_weighted,
  average_weight,
  avg_weight,
  image_url,
  is_active,
}) => {
  const result = await query(
    `INSERT INTO products (
       name,
       category,
       unit,
       price_per_unit,
       company_price,
       is_weighted,
       average_weight,
       avg_weight,
       image_url,
       is_active
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING
       id,
       name,
       category,
       unit,
       price_per_unit,
       company_price,
       is_weighted,
       average_weight,
       avg_weight,
       image_url,
       is_active`,
    [
      name,
      category,
      unit,
      price_per_unit,
      company_price,
      is_weighted,
      average_weight || null,
      avg_weight || null,
      image_url || null,
      is_active,
    ],
  );

  return result.rows[0];
};

export const findStoreById = async (storeId) => {
  const result = await query(
    `SELECT id
     FROM stores
     WHERE id = $1`,
    [storeId],
  );

  return result.rows[0] || null;
};

export const upsertStoreInventory = async ({
  store_id,
  product_id,
  stock_quantity,
  quantity,
  selling_price,
  status,
  is_visible,
}) => {
  const result = await query(
    `INSERT INTO store_inventory (
       store_id,
       product_id,
       stock_quantity,
       quantity,
       selling_price,
       status,
       is_visible,
       updated_at
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       COALESCE($5, (SELECT COALESCE(company_price, price_per_unit) FROM products WHERE id = $2)),
       $6,
       $7,
       NOW()
     )
     ON CONFLICT (store_id, product_id)
     DO UPDATE SET
       stock_quantity = EXCLUDED.stock_quantity,
       quantity = EXCLUDED.quantity,
       selling_price = EXCLUDED.selling_price,
       status = EXCLUDED.status,
       is_visible = EXCLUDED.is_visible,
       updated_at = NOW()
     RETURNING
       id,
       store_id,
       product_id,
       stock_quantity,
       quantity,
       selling_price,
       status,
       is_visible`,
    [store_id, product_id, stock_quantity, quantity, selling_price, status, is_visible],
  );

  return result.rows[0];
};

export const customerCanAccessStore = async (userId, storeId) => {
  const result = await query(
    `SELECT id
     FROM users
     WHERE id = $1
       AND store_id = $2
       AND role::TEXT IN ('customer', 'Customer')`,
    [userId, storeId],
  );

  return result.rowCount > 0;
};

export const findVisibleStoreCatalog = async (storeId) => {
  const result = await query(
    `SELECT
       products.id AS id,
       products.id AS product_id,
       store_inventory.id AS inventory_id,
       products.name,
       products.category,
       products.unit,
       products.price_per_unit,
       products.company_price,
       products.is_weighted,
       products.average_weight,
       COALESCE(products.avg_weight, products.average_weight) AS avg_weight,
       products.image_url,
       COALESCE(store_inventory.selling_price, products.company_price, products.price_per_unit) AS selling_price,
       store_inventory.stock_quantity,
       store_inventory.quantity,
       store_inventory.status,
       store_inventory.is_visible
     FROM store_inventory
     INNER JOIN products ON products.id = store_inventory.product_id
     WHERE store_inventory.store_id = $1
       AND products.is_active = TRUE
       AND store_inventory.status = 'available'
     ORDER BY products.category ASC, products.name ASC`,
    [storeId],
  );

  return result.rows;
};
