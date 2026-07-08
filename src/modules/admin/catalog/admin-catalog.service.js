import { AppError } from '../../../utils/AppError.js';
import * as repository from './admin-catalog.repository.js';

const storeStatuses = new Set(['active', 'inactive', 'paused', 'closed']);
const discountTypes = new Set(['fixed_amount', 'percentage']);
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
const units = new Set(['kg', 'pcs', 'l']);

const toNumber = (value) => Number(value);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const normalizeCategory = (category) => categoryMap[String(category || '').trim().toLowerCase()];
const normalizeUnit = (unit) => {
  const normalized = String(unit || '').trim().toLowerCase();
  return units.has(normalized) ? normalized : undefined;
};
const normalizeCode = (code) => String(code || '').trim().toUpperCase();
const statusByQuantity = (quantity) => {
  if (quantity <= 0) return 'out_of_stock';
  if (quantity <= 2) return 'low_stock';
  return 'available';
};

const requireFound = (entity, code) => {
  if (!entity) {
    throw new AppError(404, `${code} was not found`, code);
  }

  return entity;
};

const handleDbError = (error) => {
  if (error.code === '23503' || error.code === '22P02') {
    throw new AppError(400, 'Invalid reference or UUID value', 'invalid_reference');
  }

  if (error.code === '23505') {
    throw new AppError(409, 'Entity already exists', 'duplicate_entity');
  }

  throw error;
};

export const listStores = async () => {
  const stores = await repository.listStores();
  return { body: { stores } };
};

export const createStore = async ({ body }) => {
  const name = String(body.name || '').trim();
  const address = String(body.address || '').trim();
  const status = body.status || 'active';

  if (!name || !address) {
    throw new AppError(400, 'name and address are required', 'store_required_fields');
  }

  if (!storeStatuses.has(status)) {
    throw new AppError(400, 'Invalid store status', 'invalid_store_status');
  }

  const store = await repository.withTransaction((client) => repository.insertStoreWithDefaults(client, {
    name,
    address,
    location: body.location || null,
    operatingHours: body.operating_hours || null,
    deliveryTimeMin: body.delivery_time_min ?? null,
    deliveryTimeMax: body.delivery_time_max ?? null,
    status,
  }));

  return { status: 201, body: { store } };
};

export const updateStore = async ({ id, body }) => {
  const fields = {};

  for (const key of ['name', 'address', 'location', 'operating_hours', 'delivery_time_min', 'delivery_time_max', 'status']) {
    if (has(body, key)) {
      fields[key] = body[key];
    }
  }

  if (has(fields, 'status') && !storeStatuses.has(fields.status)) {
    throw new AppError(400, 'Invalid store status', 'invalid_store_status');
  }

  const store = requireFound(await repository.updateStoreById(id, fields), 'store_not_found');
  return { body: { store } };
};

export const deleteStore = async ({ id }) => {
  const store = requireFound(await repository.softDeleteStoreById(id), 'store_not_found');
  return { body: { store } };
};

export const upsertCoverage = async ({ body }) => {
  const address = String(body.address || '').trim();

  if (!body.store_id || !address) {
    throw new AppError(400, 'store_id and address are required', 'coverage_required_fields');
  }

  try {
    const coverage = await repository.upsertCoverage({
      storeId: body.store_id,
      address,
      entranceCount: body.entrance_count ?? null,
    });

    const { created, ...payload } = coverage;
    return { status: created ? 201 : 200, body: { coverage: payload } };
  } catch (error) {
    handleDbError(error);
  }
};

export const listProducts = async () => {
  const products = await repository.listProducts();
  return { body: { products } };
};

const productPayload = (body, { partial = false } = {}) => {
  const fields = {};

  if (!partial || has(body, 'name')) {
    const name = String(body.name || '').trim();
    if (!name) throw new AppError(400, 'name is required', 'product_name_required');
    fields.name = name;
  }

  if (!partial || has(body, 'category')) {
    const category = normalizeCategory(body.category);
    if (!category) throw new AppError(400, 'Invalid product category', 'invalid_product_category');
    fields.category = category;
  }

  if (!partial || has(body, 'unit')) {
    const unit = normalizeUnit(body.unit);
    if (!unit) throw new AppError(400, 'Invalid product unit', 'invalid_product_unit');
    fields.unit = unit;
  }

  if (!partial || has(body, 'price_per_unit')) {
    const price = toNumber(body.price_per_unit);
    if (!Number.isFinite(price) || price < 0) throw new AppError(400, 'Invalid price_per_unit', 'invalid_price_per_unit');
    fields.price_per_unit = price;
  }

  if (!partial || has(body, 'company_price')) {
    const price = toNumber(body.company_price);
    if (!Number.isFinite(price) || price < 0) throw new AppError(400, 'Invalid company_price', 'invalid_company_price');
    fields.company_price = price;
  }

  if (!partial || has(body, 'is_weighted')) {
    if (typeof body.is_weighted !== 'boolean') throw new AppError(400, 'is_weighted must be boolean', 'invalid_is_weighted');
    fields.is_weighted = body.is_weighted;
  }

  if (has(body, 'is_active')) {
    if (typeof body.is_active !== 'boolean') throw new AppError(400, 'is_active must be boolean', 'invalid_is_active');
    fields.is_active = body.is_active;
  } else if (!partial) {
    fields.is_active = true;
  }

  return fields;
};

export const createProduct = async ({ body }) => {
  const fields = productPayload(body);
  const product = await repository.insertProduct({
    name: fields.name,
    category: fields.category,
    unit: fields.unit,
    pricePerUnit: fields.price_per_unit,
    companyPrice: fields.company_price,
    isWeighted: fields.is_weighted,
    isActive: fields.is_active,
  });

  return { status: 201, body: { product } };
};

export const updateProduct = async ({ id, body }) => {
  const fields = productPayload(body, { partial: true });
  const product = requireFound(await repository.updateProductById(id, fields), 'product_not_found');
  return { body: { product } };
};

export const deleteProduct = async ({ id }) => {
  const product = requireFound(await repository.softDeleteProductById(id), 'product_not_found');
  return { body: { product } };
};

export const listStoreInventory = async ({ storeId }) => {
  const inventory = await repository.listStoreInventory(storeId);
  return { body: { inventory } };
};

export const upsertStoreInventory = async ({ storeId, productId, body }) => {
  const quantity = has(body, 'quantity') ? toNumber(body.quantity) : 0;
  const sellingPrice = body.selling_price === null || body.selling_price === undefined
    ? null
    : toNumber(body.selling_price);
  const isVisible = has(body, 'is_visible') ? body.is_visible : true;

  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new AppError(400, 'Invalid inventory quantity', 'invalid_inventory_quantity');
  }

  if (sellingPrice !== null && (!Number.isFinite(sellingPrice) || sellingPrice < 0)) {
    throw new AppError(400, 'Invalid selling_price', 'invalid_selling_price');
  }

  if (typeof isVisible !== 'boolean') {
    throw new AppError(400, 'is_visible must be boolean', 'invalid_is_visible');
  }

  try {
    const inventory = await repository.upsertStoreInventory({
      storeId,
      productId,
      sellingPrice,
      quantity,
      stockQuantity: Math.ceil(quantity),
      isVisible,
      status: statusByQuantity(quantity),
    });

    return { body: { inventory } };
  } catch (error) {
    handleDbError(error);
  }
};

export const receiveStoreInventory = async ({ storeId, productId, body }) => {
  const quantity = toNumber(body.quantity);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new AppError(400, 'quantity must be greater than 0', 'invalid_inventory_quantity');
  }

  const inventory = requireFound(await repository.receiveStoreInventory({ storeId, productId, quantity }), 'inventory_not_found');
  return { body: { inventory } };
};

export const listPromoCodes = async () => {
  const promoCodes = await repository.listPromoCodes();
  return { body: { promo_codes: promoCodes } };
};

const promoPayload = (body, { partial = false } = {}) => {
  const fields = {};

  if (!partial || has(body, 'code')) {
    const code = normalizeCode(body.code);
    if (!code) throw new AppError(400, 'code is required', 'promo_code_required');
    fields.code = code;
  }

  if (!partial || has(body, 'discount_type')) {
    if (!discountTypes.has(body.discount_type)) throw new AppError(400, 'Invalid discount_type', 'invalid_discount_type');
    fields.discount_type = body.discount_type;
  }

  if (!partial || has(body, 'discount_value')) {
    const value = toNumber(body.discount_value);
    if (!Number.isFinite(value) || value <= 0) throw new AppError(400, 'Invalid discount_value', 'invalid_discount_value');
    fields.discount_value = value;
  }

  if (has(body, 'store_id')) fields.store_id = body.store_id;
  if (has(body, 'min_order_value')) fields.min_order_value = body.min_order_value === null ? 0 : toNumber(body.min_order_value);
  if (has(body, 'max_uses')) fields.max_uses = body.max_uses === null ? null : Number(body.max_uses);
  if (has(body, 'usage_per_customer')) fields.usage_per_customer = Number(body.usage_per_customer);
  if (has(body, 'valid_from')) fields.valid_from = body.valid_from;
  if (has(body, 'valid_until')) fields.valid_until = body.valid_until;
  if (has(body, 'is_active')) fields.is_active = body.is_active;

  if (!partial) {
    fields.store_id = has(body, 'store_id') ? body.store_id : null;
    fields.min_order_value = has(body, 'min_order_value') && body.min_order_value !== null ? toNumber(body.min_order_value) : 0;
    fields.max_uses = has(body, 'max_uses') && body.max_uses !== null ? Number(body.max_uses) : null;
    fields.usage_per_customer = has(body, 'usage_per_customer') ? Number(body.usage_per_customer) : 1;
    fields.valid_from = body.valid_from || null;
    fields.valid_until = body.valid_until || null;
    fields.is_active = has(body, 'is_active') ? body.is_active : true;
  }

  if (has(fields, 'min_order_value') && (!Number.isFinite(fields.min_order_value) || fields.min_order_value < 0)) {
    throw new AppError(400, 'Invalid min_order_value', 'invalid_min_order_value');
  }
  if (has(fields, 'max_uses') && fields.max_uses !== null && (!Number.isInteger(fields.max_uses) || fields.max_uses < 0)) {
    throw new AppError(400, 'Invalid max_uses', 'invalid_max_uses');
  }
  if (has(fields, 'usage_per_customer') && (!Number.isInteger(fields.usage_per_customer) || fields.usage_per_customer <= 0)) {
    throw new AppError(400, 'Invalid usage_per_customer', 'invalid_usage_per_customer');
  }
  if (has(fields, 'is_active') && typeof fields.is_active !== 'boolean') {
    throw new AppError(400, 'is_active must be boolean', 'invalid_is_active');
  }

  return fields;
};

export const createPromoCode = async ({ body }) => {
  try {
    const promoCode = await repository.insertPromoCode(promoPayload(body));
    return { status: 201, body: { promo_code: promoCode } };
  } catch (error) {
    handleDbError(error);
  }
};

export const updatePromoCode = async ({ id, body }) => {
  try {
    const promoCode = requireFound(await repository.updatePromoCodeById(id, promoPayload(body, { partial: true })), 'promo_code_not_found');
    return { body: { promo_code: promoCode } };
  } catch (error) {
    handleDbError(error);
  }
};

export const deletePromoCode = async ({ id }) => {
  const promoCode = requireFound(await repository.softDeletePromoCodeById(id), 'promo_code_not_found');
  return { body: { promo_code: promoCode } };
};

export const getDeliverySettings = async ({ storeId }) => {
  const deliverySettings = requireFound(await repository.findDeliverySettings(storeId), 'delivery_settings_not_found');
  return { body: { delivery_settings: deliverySettings } };
};

export const upsertDeliverySettings = async ({ storeId, body }) => {
  const deliverySettings = await repository.upsertDeliverySettings({
    storeId,
    minOrderValueForFreeDelivery: has(body, 'min_order_value_for_free_delivery') ? body.min_order_value_for_free_delivery : null,
    deliveryFee: has(body, 'delivery_fee') ? body.delivery_fee : null,
    orderingOpenHour: has(body, 'ordering_open_hour') ? body.ordering_open_hour : null,
    orderingCloseHour: has(body, 'ordering_close_hour') ? body.ordering_close_hour : null,
  });

  return { body: { delivery_settings: deliverySettings } };
};
