import { query } from '../../config/db.js';

export const findPublicStoreCatalog = async (storeId) => {
  const result = await query(
    `SELECT
       p.id AS product_id,
       si.id AS inventory_id,
       p.name,
       p.category,
       p.unit,
       p.is_weighted,
       COALESCE(si.selling_price, p.price_per_unit) AS price_per_unit,
       si.selling_price,
       si.quantity,
       si.status
     FROM store_inventory si
     INNER JOIN products p ON p.id = si.product_id
     WHERE si.store_id = $1
       AND p.is_active = TRUE
       AND si.is_visible = TRUE
       AND si.quantity > 0
     ORDER BY p.category ASC, p.name ASC`,
    [storeId],
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
     RETURNING
       id,
       name,
       category,
       unit,
       price_per_unit,
       company_price,
       is_weighted,
       is_active,
       created_at,
       updated_at`,
    [name, category, unit, pricePerUnit, companyPrice, isWeighted, isActive],
  );

  return result.rows[0];
};

export const upsertStoreInventory = async ({
  storeId,
  productId,
  sellingPrice,
  quantity,
  stockQuantity,
  status,
}) => {
  const result = await query(
    `INSERT INTO store_inventory (
       store_id,
       product_id,
       quantity,
       stock_quantity,
       selling_price,
       is_visible,
       status,
       last_delivery_date
     )
     VALUES ($1, $2, $3, $4, $5, TRUE, $6, CURRENT_DATE)
     ON CONFLICT (store_id, product_id)
     DO UPDATE SET
       quantity = EXCLUDED.quantity,
       stock_quantity = EXCLUDED.stock_quantity,
       selling_price = EXCLUDED.selling_price,
       is_visible = TRUE,
       status = EXCLUDED.status,
       last_delivery_date = CURRENT_DATE,
       updated_at = NOW()
     RETURNING
       (xmax = 0) AS created,
       id,
       store_id,
       product_id,
       quantity,
       stock_quantity,
       selling_price,
       is_visible,
       status,
       last_delivery_date,
       created_at,
       updated_at`,
    [storeId, productId, quantity, stockQuantity, sellingPrice, status],
  );

  return result.rows[0];
};
