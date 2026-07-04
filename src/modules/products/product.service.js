import { AppError } from '../../utils/errors.js';
import { ROLES } from '../../utils/roles.js';
import {
  createProduct as createProductRepository,
  customerCanAccessStore,
  findStoreById,
  findVisibleStoreCatalog,
  upsertStoreInventory,
} from './product.repository.js';

const catalogRoles = [
  ROLES.customer,
  ROLES.adminCatalog,
  ROLES.adminOperations,
];

const legacyCatalogRoles = [
  ...catalogRoles,
  ROLES.storeOperator,
];

const inventoryStatuses = ['available', 'low_stock', 'out_of_stock'];

const toNumber = (value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return Number(value);
};

export const createProduct = async ({
  name,
  category,
  unit,
  price_per_unit,
  company_price,
  is_weighted = false,
  average_weight,
  avg_weight,
  image_url,
  is_active = true,
}) => {
  const productPrice = toNumber(price_per_unit ?? company_price);
  const companyPrice = toNumber(company_price ?? price_per_unit);
  const averageWeight = toNumber(average_weight ?? avg_weight);
  const avgWeight = toNumber(avg_weight ?? average_weight);

  if (!name || !category || !unit || productPrice === undefined) {
    throw new AppError(
      400,
      'Name, category, unit and price_per_unit or company_price are required',
      'product_required_fields',
    );
  }

  if (!Number.isFinite(productPrice) || productPrice < 0 || !Number.isFinite(companyPrice) || companyPrice < 0) {
    throw new AppError(400, 'Product price must be greater than or equal to 0', 'invalid_product_price');
  }

  if (averageWeight !== undefined && (!Number.isFinite(averageWeight) || averageWeight <= 0)) {
    throw new AppError(400, 'average_weight must be greater than 0', 'invalid_average_weight');
  }

  try {
    const product = await createProductRepository({
      name,
      category,
      unit,
      price_per_unit: productPrice,
      company_price: companyPrice,
      is_weighted,
      average_weight: averageWeight,
      avg_weight: avgWeight,
      image_url,
      is_active,
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
  quantity,
  selling_price,
  status = 'available',
}) => {
  const quantityValue = toNumber(quantity ?? stock_quantity);
  const stockQuantityValue = toNumber(stock_quantity ?? Math.trunc(quantityValue ?? 0));
  const sellingPriceValue = toNumber(selling_price);

  if (!store_id || !product_id || quantityValue === undefined) {
    throw new AppError(
      400,
      'store_id, product_id and quantity or stock_quantity are required',
      'inventory_required_fields',
    );
  }

  if (!Number.isFinite(quantityValue) || quantityValue < 0) {
    throw new AppError(400, 'quantity must be greater than or equal to 0', 'invalid_quantity');
  }

  if (!Number.isInteger(stockQuantityValue) || stockQuantityValue < 0) {
    throw new AppError(400, 'stock_quantity must be a non-negative integer', 'invalid_stock_quantity');
  }

  if (sellingPriceValue !== undefined && (!Number.isFinite(sellingPriceValue) || sellingPriceValue < 0)) {
    throw new AppError(400, 'selling_price must be greater than or equal to 0', 'invalid_selling_price');
  }

  if (!inventoryStatuses.includes(status)) {
    throw new AppError(400, 'Invalid inventory status', 'invalid_inventory_status');
  }

  try {
    const inventory = await upsertStoreInventory({
      store_id,
      product_id,
      stock_quantity: stockQuantityValue,
      quantity: quantityValue,
      selling_price: sellingPriceValue,
      status,
      is_visible: status === 'available',
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
  if (!legacyCatalogRoles.includes(user?.role)) {
    throw new AppError(
      403,
      'Access denied: you do not have permission to view this catalog',
      'catalog_access_denied',
    );
  }

  const store = await findStoreById(storeId);

  if (!store) {
    throw new AppError(404, 'Store was not found', 'store_not_found');
  }

  if (user.role === ROLES.customer) {
    const tokenStoreMatches = user.store_id && String(user.store_id) === String(storeId);
    const canAccessStore = tokenStoreMatches || await customerCanAccessStore(user.id, storeId);

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
