import { AppError } from '../../utils/AppError.js';
import { roundMoney } from '../../utils/roundMoney.js';
import {
  countPromoCodeUses,
  countPromoCodeUsesByCustomer,
  findCustomerByUserId,
  findPromoCodeByCode,
  insertPromoCode,
  listPromoCodes as listPromoCodesRepository,
} from './promocodes.repository.js';

const discountTypes = new Set(['fixed_amount', 'percentage']);

const invalid = (errorMessage) => ({
  is_valid: false,
  discount_amount: 0,
  error_message: errorMessage,
});

const normalizeCode = (code) => String(code || '').trim().toUpperCase();

const toNumber = (value) => Number(value);

const calculateDiscount = ({ promoCode, orderTotal }) => {
  const discountValue = Number(promoCode.discount_value);
  const rawDiscount = promoCode.discount_type === 'percentage'
    ? roundMoney(orderTotal * discountValue / 100)
    : discountValue;

  return roundMoney(Math.min(rawDiscount, orderTotal));
};

const validatePromoForCustomer = async ({ promoCode, customer, orderTotal }) => {
  if (!promoCode) {
    return invalid('Promo code was not found');
  }

  if (promoCode.is_active !== true) {
    return invalid('Promo code is inactive');
  }

  if (promoCode.store_id && String(promoCode.store_id) !== String(customer.store_id)) {
    return invalid('Promo code is not valid for this store');
  }

  const now = new Date();

  if (promoCode.valid_from && new Date(promoCode.valid_from) > now) {
    return invalid('Promo code is not active yet');
  }

  if (promoCode.valid_until && new Date(promoCode.valid_until) < now) {
    return invalid('Promo code has expired');
  }

  if (Number(promoCode.min_order_value || 0) > orderTotal) {
    return invalid('Order total is below promo code minimum');
  }

  if (promoCode.max_uses !== null && promoCode.max_uses !== undefined) {
    const useCount = await countPromoCodeUses(promoCode.id);

    if (useCount >= Number(promoCode.max_uses)) {
      return invalid('Promo code usage limit reached');
    }
  }

  const customerUseCount = await countPromoCodeUsesByCustomer({
    promoCodeId: promoCode.id,
    customerId: customer.id,
  });

  if (customerUseCount >= Number(promoCode.usage_per_customer)) {
    return invalid('Promo code customer usage limit reached');
  }

  return {
    is_valid: true,
    discount_amount: calculateDiscount({ promoCode, orderTotal }),
    error_message: null,
  };
};

export const validatePromoCode = async ({ user, body }) => {
  const code = normalizeCode(body.promo_code);
  const orderTotal = toNumber(body.order_total);

  if (!code) {
    throw new AppError(400, 'promo_code is required', 'promo_code_required');
  }

  if (!Number.isFinite(orderTotal) || orderTotal < 0) {
    throw new AppError(400, 'order_total must be greater than or equal to 0', 'invalid_order_total');
  }

  const customer = await findCustomerByUserId(user.id);

  if (!customer) {
    throw new AppError(404, 'Customer was not found', 'customer_not_found');
  }

  const promoCode = await findPromoCodeByCode(code);

  return validatePromoForCustomer({ promoCode, customer, orderTotal });
};

export const listPromoCodes = async ({ query }) => {
  const promoCodes = await listPromoCodesRepository({ storeId: query.store_id });

  return { promo_codes: promoCodes };
};

export const createPromoCode = async ({ body }) => {
  const code = normalizeCode(body.code);
  const discountType = body.discount_type;
  const discountValue = toNumber(body.discount_value);
  const minOrderValue = body.min_order_value === undefined || body.min_order_value === null
    ? 0
    : toNumber(body.min_order_value);
  const usagePerCustomer = body.usage_per_customer === undefined || body.usage_per_customer === null
    ? 1
    : Number(body.usage_per_customer);
  const maxUses = body.max_uses === undefined ? null : body.max_uses;
  const isActive = body.is_active === undefined ? true : body.is_active;

  if (!code) {
    throw new AppError(400, 'code is required', 'promo_code_required');
  }

  if (!discountTypes.has(discountType)) {
    throw new AppError(400, 'discount_type must be fixed_amount or percentage', 'invalid_discount_type');
  }

  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    throw new AppError(400, 'discount_value must be greater than 0', 'invalid_discount_value');
  }

  if (!Number.isFinite(minOrderValue) || minOrderValue < 0) {
    throw new AppError(400, 'min_order_value must be greater than or equal to 0', 'invalid_min_order_value');
  }

  if (!Number.isInteger(usagePerCustomer) || usagePerCustomer <= 0) {
    throw new AppError(400, 'usage_per_customer must be a positive integer', 'invalid_usage_per_customer');
  }

  if (maxUses !== null && (!Number.isInteger(Number(maxUses)) || Number(maxUses) < 0)) {
    throw new AppError(400, 'max_uses must be null or a non-negative integer', 'invalid_max_uses');
  }

  if (typeof isActive !== 'boolean') {
    throw new AppError(400, 'is_active must be boolean', 'invalid_is_active');
  }

  try {
    const promoCode = await insertPromoCode({
      storeId: body.store_id || null,
      code,
      discountType,
      discountValue,
      minOrderValue,
      maxUses: maxUses === null ? null : Number(maxUses),
      usagePerCustomer,
      validFrom: body.valid_from || null,
      validUntil: body.valid_until || null,
      isActive,
    });

    return { promo_code: promoCode };
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError(409, 'Promo code already exists', 'promo_code_already_exists');
    }

    if (error.code === '23503' || error.code === '22P02') {
      throw new AppError(400, 'Invalid store_id', 'invalid_store_id');
    }

    throw error;
  }
};
