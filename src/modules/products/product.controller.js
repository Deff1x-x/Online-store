import { query } from '../../config/db.js';

const catalogRoles = [
  'Customer',
  'Store_Op',
  'Admin_1_Catalog',
  'Admin_2_Operations',
];

const customerCanAccessStore = async (userId, storeId) => {
  const result = await query(
    `SELECT id
     FROM users
     WHERE id = $1 AND store_id = $2 AND role = 'Customer'`,
    [userId, storeId],
  );

  return result.rowCount > 0;
};

export const adminCreateProduct = async (request, response) => {
  const {
    name,
    category,
    unit,
    price_per_unit,
    is_weighted = false,
    average_weight,
  } = request.body;

  if (!name || !category || !unit || price_per_unit === undefined) {
    return response.status(400).json({
      message: 'Name, category, unit and price_per_unit are required',
    });
  }

  try {
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

    return response.status(201).json({
      message: 'Product created successfully',
      product: result.rows[0],
    });
  } catch (error) {
    if (error.code === '22P02') {
      return response.status(400).json({
        message: 'Invalid category or unit value',
      });
    }

    console.error('Create product error:', error);
    return response.status(500).json({
      message: 'Failed to create product',
    });
  }
};

export const adminLinkProductToStore = async (request, response) => {
  const { store_id, product_id, stock_quantity } = request.body;

  if (!store_id || !product_id || stock_quantity === undefined) {
    return response.status(400).json({
      message: 'store_id, product_id and stock_quantity are required',
    });
  }

  try {
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

    return response.status(201).json({
      message: 'Product linked to store inventory successfully',
      inventory: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23503') {
      return response.status(400).json({
        message: 'Store or product was not found',
      });
    }

    if (error.code === '23514') {
      return response.status(400).json({
        message: 'stock_quantity must be greater than or equal to 0',
      });
    }

    console.error('Link product to store error:', error);
    return response.status(500).json({
      message: 'Failed to link product to store',
    });
  }
};

export const getStoreCatalog = async (request, response) => {
  const { store_id } = request.params;
  const userRole = request.user?.role;

  if (!catalogRoles.includes(userRole)) {
    return response.status(403).json({
      message: 'Access denied: you do not have permission to view this catalog',
    });
  }

  try {
    // Customers are isolated to the one store assigned during registration.
    if (userRole === 'Customer') {
      const canAccessStore = await customerCanAccessStore(request.user.id, store_id);

      if (!canAccessStore) {
        return response.status(403).json({
          message: 'Customers can only view the catalog of their assigned store',
        });
      }
    }

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
      [store_id],
    );

    return response.status(200).json({
      store_id,
      products: result.rows,
    });
  } catch (error) {
    console.error('Get store catalog error:', error);
    return response.status(500).json({
      message: 'Failed to fetch store catalog',
    });
  }
};
