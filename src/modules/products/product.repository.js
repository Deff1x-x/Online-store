import { query } from '../../config/db.js';

export const createProduct = async ({
  name,
  category,
  unit,
  price_per_unit,
  is_weighted,
  average_weight,
}) => {
  const result = await query(
    `INSERT INTO products (
       name,
       category,
       unit,
       price_per_unit,
       is_weighted,
       average_weight
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, category, unit, price_per_unit, is_weighted, average_weight`,
    [
      name,
      category,
      unit,
      price_per_unit,
      is_weighted,
      average_weight || null,
    ],
  );

  return result.rows[0];
};

export const upsertStoreInventory = async ({
  store_id,
  product_id,
  stock_quantity,
}) => {
  const result = await query(
    `INSERT INTO store_inventory (store_id, product_id, stock_quantity, is_visible)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (store_id, product_id)
     DO UPDATE SET
       stock_quantity = EXCLUDED.stock_quantity,
       is_visible = TRUE
     RETURNING id, store_id, product_id, stock_quantity, is_visible`,
    [store_id, product_id, stock_quantity],
  );

  return result.rows[0];
};

export const customerCanAccessStore = async (userId, storeId) => {
  const result = await query(
    `SELECT id
     FROM users
     WHERE id = $1 AND store_id = $2 AND role::TEXT = 'customer'`,
    [userId, storeId],
  );

  return result.rowCount > 0;
};

export const findVisibleStoreCatalog = async (storeId) => {
  const result = await query(
    `SELECT
       products.id,
       products.name,
       products.category,
       products.unit,
       products.price_per_unit,
       products.is_weighted,
       products.average_weight,
       store_inventory.stock_quantity,
       store_inventory.is_visible
     FROM store_inventory
     INNER JOIN products ON products.id = store_inventory.product_id
     WHERE store_inventory.store_id = $1
       AND store_inventory.stock_quantity > 0
       AND store_inventory.is_visible = TRUE
     ORDER BY products.category ASC, products.name ASC`,
    [storeId],
  );

  return result.rows;
};
