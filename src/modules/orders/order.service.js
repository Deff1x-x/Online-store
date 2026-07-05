import { randomUUID } from 'crypto';
import { AppError } from '../../utils/errors.js';
import {
  createOrderItem,
  createOrderRecord,
  createCustomerRecordForUser,
  findAvailableStoreProduct,
  findCustomerById,
  findCustomerRecordForUser,
  findDeliveryAddressForOrder,
  findCustomerOrderPricingScope,
  withOrderTransaction,
} from './order.repository.js';
import { calculateDeliveryFee } from './delivery-settings.service.js';
import {
  applyFirstOrderDiscount,
  getApplicableFirstOrderDiscount,
  hasFirstOrderDiscountForOrder,
} from './first-order-discounts.service.js';
import {
  applyPromoCodeUsage,
  validatePromoCodeForCustomer,
} from './promo-codes.service.js';

const onlinePaymentDiscountRate = 0.05;

const roundMoney = (value) => {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
};

const roundWeight = (value) => {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
};

const createOrderNumber = () => {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  return `ORD-${datePart}-${suffix}`;
};

const validateDiscountAmount = ({ discountAmount, subtotal }) => {
  const amount = roundMoney(discountAmount);

  if (!Number.isFinite(amount) || amount < 0 || amount > subtotal) {
    throw new AppError(
      400,
      'Discount amount exceeds order subtotal.',
      'discount_amount_exceeds_order_subtotal',
    );
  }

  return amount;
};

const throwDiscountStackingPolicyError = () => {
  throw new AppError(
    400,
    'Promo code cannot be combined with first order discount until discount stacking policy is defined.',
    'discount_stacking_policy_undefined',
  );
};

export const createOrder = async ({
  user,
  payment_method,
  delivery_address_id,
  delivery_date,
  delivery_time_slot,
  promo_code,
  items,
}) => {
  const customerId = user?.id;

  if (!customerId) {
    throw new AppError(401, 'Authenticated customer is required', 'customer_auth_required');
  }

  if (!['online', 'pos'].includes(payment_method)) {
    throw new AppError(400, 'payment_method must be either online or pos', 'invalid_payment_method');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError(400, 'Order items are required', 'order_items_required');
  }

  if (!delivery_address_id) {
    throw new AppError(400, 'delivery_address_id is required', 'delivery_address_required');
  }

  return withOrderTransaction(async (client) => {
    const customer = await findCustomerById(client, customerId);

    if (!customer) {
      throw new AppError(403, 'Only customers can create orders', 'customer_required');
    }

    let customerRecord = await findCustomerRecordForUser(client, customer);

    if (customerRecord?.user_id && String(customerRecord.user_id) !== String(customer.id)) {
      throw new AppError(403, 'Customer record is linked to another user', 'customer_record_user_mismatch');
    }

    if (!customerRecord || !customerRecord.user_id) {
      customerRecord = await createCustomerRecordForUser(client, customer);
    }

    if (customerRecord.subscription_status !== 'active') {
      throw new AppError(403, 'Active subscription is required to create an order', 'active_subscription_required');
    }

    if (String(customerRecord.store_id) !== String(customer.store_id)) {
      throw new AppError(403, 'Customer record store does not match user store', 'customer_store_mismatch');
    }

    const deliveryAddress = await findDeliveryAddressForOrder({
      client,
      addressId: delivery_address_id,
      customerRecordId: customerRecord.id,
    });

    if (!deliveryAddress) {
      throw new AppError(
        403,
        'delivery_address_id must belong to the current customer',
        'delivery_address_access_denied',
      );
    }

    if (String(deliveryAddress.store_id) !== String(customer.store_id)) {
      throw new AppError(
        403,
        'Delivery address coverage must belong to the customer store',
        'delivery_address_store_mismatch',
      );
    }

    const orderItems = [];
    let subtotal = 0;
    let estimatedWeightTotal = 0;

    for (const item of items) {
      const { product_id, quantity } = item;
      const parsedQuantity = Number(quantity);

      if (!product_id || !Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
        throw new AppError(
          400,
          'Each item must include product_id and a positive integer quantity',
          'invalid_order_item',
        );
      }

      const product = await findAvailableStoreProduct(client, product_id, customer.store_id);

      if (!product) {
        throw new AppError(
          404,
          `Product ${product_id} is not available in the customer's store`,
          'product_not_available',
        );
      }

      const availableQuantity = Math.max(
        Number(product.quantity || 0),
        Number(product.stock_quantity || 0),
      );

      if (availableQuantity < parsedQuantity) {
        throw new AppError(
          400,
          `Product ${product_id} does not have enough stock`,
          'product_insufficient_stock',
        );
      }

      const pricePerUnit = Number(product.selling_price);
      const averageWeight = product.avg_weight === null || product.avg_weight === undefined
        ? undefined
        : Number(product.avg_weight);
      let estimatedWeight = null;
      let itemTotalPrice = 0;

      if (!Number.isFinite(pricePerUnit) || pricePerUnit < 0) {
        throw new AppError(
          400,
          `Product ${product_id} does not have a valid selling_price`,
          'product_missing_selling_price',
        );
      }

      if (averageWeight !== undefined) {
        if (!Number.isFinite(averageWeight) || averageWeight <= 0) {
          throw new AppError(
            400,
            `Product ${product_id} does not have a valid avg_weight configured`,
            'product_invalid_average_weight',
          );
        }

        estimatedWeight = roundWeight(averageWeight * parsedQuantity);
      }

      if (product.is_weighted) {
        if (estimatedWeight === null) {
          throw new AppError(
            400,
            `Weighted product ${product_id} does not have avg_weight configured`,
            'weighted_product_missing_average_weight',
          );
        }

        itemTotalPrice = estimatedWeight * pricePerUnit;
      } else {
        itemTotalPrice = parsedQuantity * pricePerUnit;
      }

      const lineTotal = roundMoney(itemTotalPrice);
      subtotal += lineTotal;

      if (estimatedWeight !== null) {
        estimatedWeightTotal += estimatedWeight;
      }

      orderItems.push({
        product_id,
        inventory_id: product.inventory_id,
        quantity: parsedQuantity,
        estimated_weight: estimatedWeight,
        price_per_unit: pricePerUnit,
        unit_price: pricePerUnit,
        line_total: lineTotal,
      });
    }

    const subtotalAmount = roundMoney(subtotal);
    const estimatedWeight = estimatedWeightTotal > 0 ? roundWeight(estimatedWeightTotal) : null;
    const firstOrderDiscountResult = await getApplicableFirstOrderDiscount(client, {
      customerRecordId: customerRecord.id,
      storeId: customer.store_id,
      userId: customer.id,
      subtotal: subtotalAmount,
    });
    const firstOrderDiscount = validateDiscountAmount({
      discountAmount: firstOrderDiscountResult.discountAmount,
      subtotal: subtotalAmount,
    });
    let remainingAfterDiscounts = roundMoney(subtotalAmount - firstOrderDiscount);
    let promoDiscount = 0;
    let appliedPromoCode = null;

    if (promo_code) {
      if (firstOrderDiscount > 0) {
        throwDiscountStackingPolicyError();
      }

      const promoValidation = await validatePromoCodeForCustomer(client, {
        customerRecordId: customerRecord.id,
        storeId: customer.store_id,
        promoCode: promo_code,
        orderTotal: subtotalAmount,
        lock: true,
      });

      if (!promoValidation.is_valid) {
        throw new AppError(400, promoValidation.error_message, 'invalid_promo_code');
      }

      promoDiscount = validateDiscountAmount({
        discountAmount: promoValidation.discount_amount,
        subtotal: subtotalAmount,
      });
      remainingAfterDiscounts = roundMoney(remainingAfterDiscounts - promoDiscount);
      appliedPromoCode = promoValidation.promoCode;
    }

    const { deliveryFee } = await calculateDeliveryFee(client, {
      storeId: customer.store_id,
      subtotal: subtotalAmount,
    });
    const finalTotal = roundMoney(remainingAfterDiscounts + deliveryFee);
    const onlinePaymentAmount = payment_method === 'online'
      ? roundMoney(finalTotal * (1 - onlinePaymentDiscountRate))
      : 0;
    const paymentStatus = 'pending';
    const breakdown = {
      subtotal: subtotalAmount,
      first_order_discount: firstOrderDiscount,
      promo_discount: promoDiscount,
      delivery_fee: deliveryFee,
      final_total: finalTotal,
    };

    const order = await createOrderRecord({
      client,
      orderNumber: createOrderNumber(),
      storeId: customer.store_id,
      customerId: customer.id,
      customerRecordId: customerRecord.id,
      deliveryAddressId: deliveryAddress.id,
      paymentMethod: payment_method,
      paymentStatus,
      deliveryStatus: 'new',
      subtotal: subtotalAmount,
      estimatedWeight,
      onlinePaymentAmount,
      finalTotal,
      totalPrice: finalTotal,
      deliveryDate: delivery_date,
      deliveryTimeSlot: delivery_time_slot,
    });

    const createdItems = [];

    for (const orderItem of orderItems) {
      const createdItem = await createOrderItem({
        client,
        orderId: order.id,
        productId: orderItem.product_id,
        quantity: orderItem.quantity,
        estimatedWeight: orderItem.estimated_weight,
        pricePerUnit: orderItem.price_per_unit,
        lineTotal: orderItem.line_total,
      });

      createdItems.push({
        ...createdItem,
        inventory_id: orderItem.inventory_id,
      });
    }

    await applyFirstOrderDiscount(client, {
      discount: firstOrderDiscountResult.discount,
      orderId: order.id,
    });

    await applyPromoCodeUsage(client, {
      promoCode: appliedPromoCode,
      customerRecordId: customerRecord.id,
      orderId: order.id,
      discountAmount: promoDiscount,
    });

    return {
      message: 'Order created successfully',
      order_id: order.id,
      order_number: order.order_number,
      payment_options: {
        online: {
          amount: roundMoney(finalTotal * (1 - onlinePaymentDiscountRate)),
        },
        pos: {
          amount: finalTotal,
        },
      },
      breakdown,
      order: {
        ...order,
        items: createdItems,
        breakdown,
      },
    };
  });
};

export const validatePromoForOrder = async ({
  user,
  orderId,
  promo_code,
  order_total,
}) => {
  if (!user?.id) {
    throw new AppError(401, 'Authenticated customer is required', 'customer_auth_required');
  }

  if (!orderId) {
    throw new AppError(400, 'order_id is required', 'order_id_required');
  }

  return withOrderTransaction(async (client) => {
    const order = await findCustomerOrderPricingScope(client, {
      orderId,
      userId: user.id,
    });

    if (!order) {
      throw new AppError(404, 'Order was not found', 'order_not_found');
    }

    if (!order.customer_record_id) {
      throw new AppError(400, 'Order is not linked to a customer record', 'customer_record_required');
    }

    if (await hasFirstOrderDiscountForOrder(client, order.id)) {
      throwDiscountStackingPolicyError();
    }

    const orderTotal = order_total === undefined || order_total === null
      ? Number(order.subtotal)
      : Number(order_total);

    if (!Number.isFinite(orderTotal) || orderTotal < 0) {
      throw new AppError(400, 'order_total must be a non-negative number', 'invalid_order_total');
    }

    const validation = await validatePromoCodeForCustomer(client, {
      customerRecordId: order.customer_record_id,
      storeId: order.store_id,
      promoCode: promo_code,
      orderTotal,
    });

    return {
      is_valid: validation.is_valid,
      discount_amount: validation.is_valid
        ? validateDiscountAmount({
          discountAmount: validation.discount_amount,
          subtotal: orderTotal,
        })
        : 0,
      error_message: validation.error_message,
    };
  });
};
