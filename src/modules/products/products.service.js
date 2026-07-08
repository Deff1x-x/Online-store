import { AppError } from '../../utils/AppError.js';
import {
  findPublicStoreCatalog,
  insertProduct,
  upsertStoreInventory,
} from './products.repository.js';

const categoryMap = Object.freeze({
  vegetables: 'vegetables',
  vegetable: 'vegetables',
  fruits: 'fruits',
  fruit: 'fruits',
  dairy: 'dairy',
  meat: 'meat',
  bakery: 'bakery',
  other: 'other',
});

const unitValues = new Set(['kg', 'pcs', 'l']);

const toNumber = (value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return Number(value);
};

const normalizeCategory = (category) => {
  const normalized = String(category || '').trim().toLowerCase();
  return categoryMap[normalized];
};

const normalizeUnit = (unit) => {
  const normalized = String(unit || '').trim().toLowerCase();
  return unitValues.has(normalized) ? normalized : undefined;
};

const inventoryStatusByQuantity = (quantity) => {
  if (quantity <= 0) {
    return 'out_of_stock';
  }

  if (quantity <= 2) {
    return 'low_stock';
  }

  return 'available';
};

export const getStoreCatalog = async (storeId) => {
  if (!storeId) {
    throw new AppError(400, 'store_id is required', 'store_id_required');
  }

  const products = await findPublicStoreCatalog(storeId);

  return { products };
};

export const createProduct = async ({
  name,
  category,
  unit,
  price_per_unit,
  company_price,
  is_weighted,
  is_active = true,
}) => {
  const productName = String(name || '').trim();
  const normalizedCategory = normalizeCategory(category);
  const normalizedUnit = normalizeUnit(unit);
  const pricePerUnit = toNumber(price_per_unit);
  const companyPrice = toNumber(company_price);

  if (!productName || !category || !unit || pricePerUnit === undefined || companyPrice === undefined) {
    throw new AppError(400, 'name, category, unit, price_per_unit and company_price are required', 'product_required_fields');
  }

  if (!normalizedCategory) {
    throw new AppError(400, 'Invalid product category', 'invalid_product_category');
  }

  if (!normalizedUnit) {
    throw new AppError(400, 'Invalid product unit', 'invalid_product_unit');
  }

  if (!Number.isFinite(pricePerUnit) || pricePerUnit < 0) {
    throw new AppError(400, 'price_per_unit must be greater than or equal to 0', 'invalid_price_per_unit');
  }

  if (!Number.isFinite(companyPrice) || companyPrice < 0) {
    throw new AppError(400, 'company_price must be greater than or equal to 0', 'invalid_company_price');
  }

  if (typeof is_weighted !== 'boolean') {
    throw new AppError(400, 'is_weighted must be boolean', 'invalid_is_weighted');
  }

  if (typeof is_active !== 'boolean') {
    throw new AppError(400, 'is_active must be boolean', 'invalid_is_active');
  }

  const product = await insertProduct({
    name: productName,
    category: normalizedCategory,
    unit: normalizedUnit,
    pricePerUnit,
    companyPrice,
    isWeighted: is_weighted,
    isActive: is_active,
  });

  return { product };
};

export const linkProductToStore = async ({
  store_id,
  product_id,
  selling_price,
  quantity,
}) => {
  const quantityValue = toNumber(quantity);
  const sellingPriceValue = toNumber(selling_price);

  if (!store_id || !product_id || quantityValue === undefined) {
    throw new AppError(400, 'store_id, product_id and quantity are required', 'inventory_required_fields');
  }

  if (!Number.isFinite(quantityValue) || quantityValue < 0) {
    throw new AppError(400, 'quantity must be greater than or equal to 0', 'invalid_quantity');
  }

  if (sellingPriceValue !== undefined && (!Number.isFinite(sellingPriceValue) || sellingPriceValue < 0)) {
    throw new AppError(400, 'selling_price must be greater than or equal to 0', 'invalid_selling_price');
  }

  try {
    const inventory = await upsertStoreInventory({
      storeId: store_id,
      productId: product_id,
      sellingPrice: sellingPriceValue ?? null,
      quantity: quantityValue,
      stockQuantity: Math.ceil(quantityValue),
      status: inventoryStatusByQuantity(quantityValue),
    });

    const { created, ...inventoryPayload } = inventory;

    return {
      created,
      inventory: inventoryPayload,
    };
  } catch (error) {
    if (error.code === '23503') {
      throw new AppError(400, 'Store or product was not found', 'store_or_product_not_found');
    }

    if (error.code === '22P02') {
      throw new AppError(400, 'Invalid UUID value', 'invalid_uuid');
    }

    throw error;
  }
};
