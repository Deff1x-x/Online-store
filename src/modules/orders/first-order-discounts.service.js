import {
  countCustomerStoreOrders,
  findFirstOrderDiscountForOrder,
  findUnusedFirstOrderDiscount,
  markFirstOrderDiscountUsed,
} from './first-order-discounts.repository.js';

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const calculateDiscountAmount = ({ discount, baseAmount }) => {
  if (!discount) {
    return 0;
  }

  if (discount.discount_type === 'percentage') {
    return roundMoney(baseAmount * (Number(discount.discount_value) / 100));
  }

  return roundMoney(discount.discount_value);
};

export const getApplicableFirstOrderDiscount = async (client, {
  customerRecordId,
  storeId,
  userId,
  subtotal,
}) => {
  const previousOrderCount = await countCustomerStoreOrders(client, { customerRecordId, storeId, userId });

  if (previousOrderCount > 0) {
    return {
      discount: null,
      discountAmount: 0,
    };
  }

  const discount = await findUnusedFirstOrderDiscount(client, { customerRecordId, storeId });

  if (!discount) {
    return {
      discount: null,
      discountAmount: 0,
    };
  }

  return {
    discount,
    discountAmount: calculateDiscountAmount({ discount, baseAmount: subtotal }),
  };
};

export const applyFirstOrderDiscount = async (client, { discount, orderId }) => {
  if (!discount) {
    return null;
  }

  return markFirstOrderDiscountUsed(client, {
    discountId: discount.id,
    orderId,
  });
};

export const hasFirstOrderDiscountForOrder = async (client, orderId) => {
  const discount = await findFirstOrderDiscountForOrder(client, orderId);

  return Boolean(discount);
};
