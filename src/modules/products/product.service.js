import { AppError } from '../../utils/errors.js';
import { ROLES } from '../../utils/roles.js';
import {
  createProduct as createProductRepository,
  customerCanAccessStore,
  findVisibleStoreCatalog,
  upsertStoreInventory,
} from './product.repository.js';

const catalogRoles = [
  ROLES.customer,
  ROLES.storeOperator,
  ROLES.adminCatalog,
  ROLES.adminOperations,
];

export const createProduct = async ({
  name,
  category,
  unit,
  price_per_unit,
  is_weighted = false,
  average_weight,
}) => {
  if (!name || !category || !unit || price_per_unit === undefined) {
    throw new AppError(400, 'Name, category, unit and price_per_unit are required', 'product_required_fields');
  }

  try {
    const product = await createProductRepository({
      name,
      category,
      unit,
      price_per_unit,
      is_weighted,
      average_weight,
    });

    return {
      message: 'Product created successfully',
      product,
    };
  } catch (error) {
    if (error.code === '22P02') {
      throw new AppError(400, 'Invalid category or unit value', 'invalid_product_enum');
    }

    throw error;
  }
};

export const linkProductToStore = async ({
  store_id,
  product_id,
  stock_quantity,
}) => {
  if (!store_id || !product_id || stock_quantity === undefined) {
    throw new AppError(
      400,
      'store_id, product_id and stock_quantity are required',
      'inventory_required_fields',
    );
  }

  try {
    const inventory = await upsertStoreInventory({
      store_id,
      product_id,
      stock_quantity,
    });

    return {
      message: 'Product linked to store inventory successfully',
      inventory,
    };
  } catch (error) {
    if (error.code === '23503') {
      throw new AppError(400, 'Store or product was not found', 'store_or_product_not_found');
    }

    if (error.code === '23514') {
      throw new AppError(400, 'stock_quantity must be greater than or equal to 0', 'invalid_stock_quantity');
    }

    throw error;
  }
};

export const getStoreCatalog = async ({ storeId, user }) => {
  if (!catalogRoles.includes(user?.role)) {
    throw new AppError(
      403,
      'Access denied: you do not have permission to view this catalog',
      'catalog_access_denied',
    );
  }

  if (user.role === ROLES.customer) {
    const canAccessStore = await customerCanAccessStore(user.id, storeId);

    if (!canAccessStore) {
      throw new AppError(
        403,
        'Customers can only view the catalog of their assigned store',
        'customer_store_mismatch',
      );
    }
  }

  const products = await findVisibleStoreCatalog(storeId);

  return {
    store_id: storeId,
    products,
  };
};
