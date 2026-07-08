import crypto from 'crypto';
import { AppError } from '../../utils/AppError.js';
import { roundMoney } from '../../utils/roundMoney.js';
import {
  countPromoUses,
  countPromoUsesByCustomer,
  findCustomerForOrder,
  findCustomerIdByUserId,
  findDeliveryAddressForCustomer,
  findDeliverySettings,
  findFirstOrderDiscount,
  findOrderByCustomer,
  findOrdersByCustomer,
  findPromoCodeForOrder,
  findStoreProductForOrder,
  insertOrder,
  insertOrderItem,
  insertOrderStatusHistory,
  insertPromoCodeUsage,
  markFirstOrderDiscountUsed,
  reserveInventory,
  withTransaction,
} from './orders.repository.js';

const paymentHoldRate = 0.8;
const almatyUtcOffsetHours = 5;

const toNumber = (value) => Number(value);

const roundQuantity = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

const isWholeNumber = (value) => Number.isInteger(Number(value));

const toDateOnly = (date) => date.toISOString().slice(0, 10);

const almatyNow = () => new Date(Date.now() + almatyUtcOffsetHours * 60 * 60 * 1000);

const orderNumber = () => {
  const datePart = toDateOnly(almatyNow()).replaceAll('-', '');
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `ORD-${datePart}-${suffix}`;
};

const calculateFulfillmentWindow = ({ openHour, closeHour }) => {
  const now = almatyNow();
  const hour = now.getUTCHours();
  const deliveryDate = new Date(now);

  if (hour >= openHour && hour < closeHour) {
    return {
      fulfillmentWindow: 'same_day',
      deliveryDate: toDateOnly(deliveryDate),
      deliveryTimeSlot: null,
    };
  }

  if (hour >= closeHour) {
    deliveryDate.setUTCDate(deliveryDate.getUTCDate() + 1);
  }

  return {
    fulfillmentWindow: 'next_morning',
    deliveryDate: toDateOnly(deliveryDate),
    deliveryTimeSlot: 'morning_from_11:00',
  };
};

const ensureActiveSubscription = (customer) => {
  if (!customer || customer.subscription_status !== 'active') {
    throw new AppError(403, 'Active subscription is required', 'subscription_required');
  }

  if (!customer.subscription_end_date) {
    throw new AppError(403, 'Active subscription is required', 'subscription_required');
  }

  const today = toDateOnly(almatyNow());
  const subscriptionEnd = toDateOnly(new Date(customer.subscription_end_date));

  if (subscriptionEnd < today) {
    throw new AppError(403, 'Active subscription is required', 'subscription_required');
  }
};

const validateItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError(400, 'items must be a non-empty array', 'order_items_required');
  }
};

const promoDiscountAmount = (promo, subtotal) => {
  const value = Number(promo.discount_value);

  if (promo.discount_type === 'percentage') {
    return roundMoney(Math.min(subtotal, subtotal * value / 100));
  }

  return roundMoney(Math.min(subtotal, value));
};

const validatePromoCode = async (client, { promoCode, customerId, storeId, subtotal }) => {
  if (!promoCode) {
    return { discount: 0, promo: null };
  }

  const promo = await findPromoCodeForOrder(client, promoCode);

  if (!promo || promo.is_active !== true) {
    throw new AppError(400, 'Promo code is invalid', 'invalid_promo_code');
  }

  if (promo.store_id && String(promo.store_id) !== String(storeId)) {
    throw new AppError(400, 'Promo code is invalid for this store', 'invalid_promo_code');
  }

  const now = new Date();

  if (promo.valid_from && new Date(promo.valid_from) > now) {
    throw new AppError(400, 'Promo code is not active yet', 'invalid_promo_code');
  }

  if (promo.valid_until && new Date(promo.valid_until) < now) {
    throw new AppError(400, 'Promo code has expired', 'invalid_promo_code');
  }

  if (Number(promo.min_order_value || 0) > subtotal) {
    throw new AppError(400, 'Order total is below promo code minimum', 'invalid_promo_code');
  }

  if (promo.max_uses !== null && promo.max_uses !== undefined) {
    const useCount = await countPromoUses(client, promo.id);

    if (useCount >= Number(promo.max_uses)) {
      throw new AppError(400, 'Promo code usage limit reached', 'invalid_promo_code');
    }
  }

  const customerUseCount = await countPromoUsesByCustomer(client, {
    promoCodeId: promo.id,
    customerId,
  });

  if (customerUseCount >= Number(promo.usage_per_customer)) {
    throw new AppError(400, 'Promo code customer usage limit reached', 'invalid_promo_code');
  }

  return {
    discount: promoDiscountAmount(promo, subtotal),
    promo,
  };
};

export const createOrder = async ({ user, body }) => {
  const {
    payment_method,
    delivery_address_id,
    items,
    promo_code,
  } = body;

  if (payment_method !== 'online') {
    throw new AppError(400, 'payment_method must be online', 'invalid_payment_method');
  }

  if (!delivery_address_id) {
    throw new AppError(400, 'delivery_address_id is required', 'delivery_address_required');
  }

  validateItems(items);

  return withTransaction(async (client) => {
    const customer = await findCustomerForOrder(client, user.id);

    ensureActiveSubscription(customer);

    const deliveryAddress = await findDeliveryAddressForCustomer(client, {
      addressId: delivery_address_id,
      customerId: customer.id,
      storeId: customer.store_id,
    });

    if (!deliveryAddress) {
      throw new AppError(404, 'Delivery address was not found', 'delivery_address_not_found');
    }

    const orderItems = [];
    let subtotal = 0;
    let estimatedWeight = 0;

    for (const item of items) {
      const quantity = roundQuantity(item.quantity);

      if (!item.product_id || !Number.isFinite(quantity) || quantity <= 0) {
        throw new AppError(400, 'Invalid order item quantity', 'invalid_order_item_quantity');
      }

      const product = await findStoreProductForOrder(client, {
        storeId: customer.store_id,
        productId: item.product_id,
      });

      if (!product || product.is_active !== true) {
        throw new AppError(400, 'Product is not available', 'product_not_available');
      }

      if (product.is_visible !== true) {
        throw new AppError(400, 'Product is not visible in store', 'product_not_available');
      }

      if (product.is_weighted !== true && !isWholeNumber(quantity)) {
        throw new AppError(400, 'Piece products require integer quantity', 'invalid_order_item_quantity');
      }

      const reserved = await reserveInventory(client, {
        inventoryId: product.inventory_id,
        quantity,
      });

      if (!reserved) {
        throw new AppError(409, 'Product reservation conflict', 'product_reservation_conflict');
      }

      const pricePerUnit = roundMoney(product.effective_price);
      const lineTotal = roundMoney(quantity * pricePerUnit);
      const itemEstimatedWeight = product.is_weighted === true ? roundQuantity(quantity) : 0;

      subtotal = roundMoney(subtotal + lineTotal);
      estimatedWeight = roundQuantity(estimatedWeight + itemEstimatedWeight);
      orderItems.push({
        productId: product.product_id,
        quantity,
        pricePerUnit,
        lineTotal,
        estimatedWeight: itemEstimatedWeight,
      });
    }

    const firstDiscount = await findFirstOrderDiscount(client, customer.id);
    const firstOrderDiscount = firstDiscount && firstDiscount.is_used === false
      ? roundMoney(Math.min(Number(firstDiscount.amount), subtotal))
      : 0;
    const promoResult = await validatePromoCode(client, {
      promoCode: promo_code,
      customerId: customer.id,
      storeId: customer.store_id,
      subtotal,
    });
    const promoDiscount = promoResult.discount;
    const useFirstDiscount = firstOrderDiscount >= promoDiscount && firstOrderDiscount > 0;
    const usePromoDiscount = promoDiscount > firstOrderDiscount && promoDiscount > 0;
    const discountTotal = useFirstDiscount ? firstOrderDiscount : promoDiscount;
    const settings = await findDeliverySettings(client, customer.store_id);
    const deliveryThreshold = Number(settings?.min_order_value_for_free_delivery ?? 5000);
    const deliveryFeeValue = Number(settings?.delivery_fee ?? 500);
    const deliveryFee = subtotal < deliveryThreshold ? roundMoney(deliveryFeeValue) : 0;
    const finalTotal = roundMoney(Math.max(0, subtotal - discountTotal) + deliveryFee);
    const onlinePaymentAmount = roundMoney(finalTotal * paymentHoldRate);
    const remainderOnDelivery = roundMoney(finalTotal - onlinePaymentAmount);
    const fulfillment = calculateFulfillmentWindow({
      openHour: Number(settings?.ordering_open_hour ?? 11),
      closeHour: Number(settings?.ordering_close_hour ?? 20),
    });

    const order = await insertOrder(client, {
      orderNumber: orderNumber(),
      storeId: customer.store_id,
      customerId: customer.id,
      deliveryAddressId: delivery_address_id,
      subtotal,
      discountTotal,
      deliveryFee,
      estimatedWeight,
      onlinePaymentAmount,
      posTerminalTopup: remainderOnDelivery,
      finalTotal,
      fulfillmentWindow: fulfillment.fulfillmentWindow,
      deliveryDate: fulfillment.deliveryDate,
      deliveryTimeSlot: fulfillment.deliveryTimeSlot,
    });

    const createdItems = [];

    for (const item of orderItems) {
      createdItems.push(await insertOrderItem(client, {
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        pricePerUnit: item.pricePerUnit,
        lineTotal: item.lineTotal,
        estimatedWeight: item.estimatedWeight,
      }));
    }

    await insertOrderStatusHistory(client, {
      orderId: order.id,
      userId: user.id,
    });

    if (useFirstDiscount) {
      await markFirstOrderDiscountUsed(client, {
        discountId: firstDiscount.id,
        orderId: order.id,
      });
    }

    if (usePromoDiscount) {
      await insertPromoCodeUsage(client, {
        promoCodeId: promoResult.promo.id,
        customerId: customer.id,
        orderId: order.id,
        discountAmount: promoDiscount,
      });
    }

    const breakdown = {
      subtotal,
      first_order_discount: useFirstDiscount ? firstOrderDiscount : 0,
      promo_discount: usePromoDiscount ? promoDiscount : 0,
      discount_total: discountTotal,
      delivery_fee: deliveryFee,
      final_total: finalTotal,
    };

    return {
      order_id: order.id,
      order_number: order.order_number,
      breakdown,
      payment_options: {
        online: {
          preauth_amount: onlinePaymentAmount,
          remainder_on_delivery: remainderOnDelivery,
          note: 'hold 80%; capture by actual weight at delivery, remainder via courier POS',
        },
        pos: {
          amount: finalTotal,
        },
      },
      order: {
        ...order,
        items: createdItems,
      },
    };
  });
};

export const listMyOrders = async ({ user }) => {
  const customerId = await findCustomerIdByUserId(user.id);

  if (!customerId) {
    return { orders: [] };
  }

  const orders = await findOrdersByCustomer({ customerId });

  return { orders };
};

export const getMyOrder = async ({ user, orderId }) => {
  const customerId = await findCustomerIdByUserId(user.id);

  if (!customerId) {
    throw new AppError(404, 'Order was not found', 'order_not_found');
  }

  const order = await findOrderByCustomer({ customerId, orderId });

  if (!order) {
    throw new AppError(404, 'Order was not found', 'order_not_found');
  }

  return { order };
};
