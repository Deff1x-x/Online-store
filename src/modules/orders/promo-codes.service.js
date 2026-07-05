import {
  countPromoCodeUsageForCustomer,
  createPromoCodeUsage,
  findPromoCodeForStore,
  incrementPromoCodeUses,
} from './promo-codes.repository.js';

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const toDateOnly = (dateValue) => {
  if (!dateValue) {
    return null;
  }

  return new Date(dateValue).toISOString().slice(0, 10);
};

const calculatePromoDiscountAmount = ({ promoCode, orderTotal }) => {
  if (promoCode.discount_type === 'percentage') {
    return roundMoney(orderTotal * (Number(promoCode.discount_value) / 100));
  }

  return roundMoney(promoCode.discount_value);
};

export const validatePromoCodeForCustomer = async (client, {
  customerRecordId,
  storeId,
  promoCode,
  orderTotal,
  lock = false,
}) => {
  const normalizedCode = typeof promoCode === 'string' ? promoCode.trim() : '';
  const parsedOrderTotal = roundMoney(orderTotal);

  if (!normalizedCode) {
    return {
      is_valid: false,
      discount_amount: 0,
      error_message: 'promo_code is required',
      promoCode: null,
    };
  }

  const foundPromoCode = await findPromoCodeForStore(client, {
    storeId,
    code: normalizedCode,
    lock,
  });

  if (!foundPromoCode || !foundPromoCode.is_active) {
    return {
      is_valid: false,
      discount_amount: 0,
      error_message: 'Invalid code',
      promoCode: null,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const validFrom = toDateOnly(foundPromoCode.valid_from);
  const validUntil = toDateOnly(foundPromoCode.valid_until);

  if ((validFrom && today < validFrom) || (validUntil && today > validUntil)) {
    return {
      is_valid: false,
      discount_amount: 0,
      error_message: 'Expired',
      promoCode: foundPromoCode,
    };
  }

  const minOrderValue = foundPromoCode.min_order_value === null || foundPromoCode.min_order_value === undefined
    ? 0
    : Number(foundPromoCode.min_order_value);

  if (parsedOrderTotal < minOrderValue) {
    return {
      is_valid: false,
      discount_amount: 0,
      error_message: 'Minimum order not met',
      promoCode: foundPromoCode,
    };
  }

  if (
    foundPromoCode.max_uses !== null
    && foundPromoCode.max_uses !== undefined
    && Number(foundPromoCode.current_uses) >= Number(foundPromoCode.max_uses)
  ) {
    return {
      is_valid: false,
      discount_amount: 0,
      error_message: 'Max uses exceeded',
      promoCode: foundPromoCode,
    };
  }

  const customerUsageCount = await countPromoCodeUsageForCustomer(client, {
    promoCodeId: foundPromoCode.id,
    customerRecordId,
  });

  if (customerUsageCount >= Number(foundPromoCode.usage_per_customer)) {
    return {
      is_valid: false,
      discount_amount: 0,
      error_message: 'Already used',
      promoCode: foundPromoCode,
    };
  }

  return {
    is_valid: true,
    discount_amount: calculatePromoDiscountAmount({
      promoCode: foundPromoCode,
      orderTotal: parsedOrderTotal,
    }),
    error_message: null,
    promoCode: foundPromoCode,
  };
};

export const applyPromoCodeUsage = async (client, {
  promoCode,
  customerRecordId,
  orderId,
  discountAmount,
}) => {
  if (!promoCode) {
    return null;
  }

  const usage = await createPromoCodeUsage(client, {
    promoCodeId: promoCode.id,
    customerRecordId,
    orderId,
    discountAmount,
  });

  if (usage) {
    await incrementPromoCodeUses(client, promoCode.id);
  }

  return usage;
};
