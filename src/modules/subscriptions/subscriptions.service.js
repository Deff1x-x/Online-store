import { AppError } from '../../utils/AppError.js';
import { ROLES } from '../../utils/roles.js';
import {
  cancelSubscriptionForCustomer,
  createSubscriptionForCustomer,
  findCustomerById,
  findCustomerByUserId,
  listSubscriptionsWithCustomers,
  renewSubscriptionForCustomer,
} from './subscriptions.repository.js';

const defaultAmount = 3900;
const defaultBillingPeriod = 'monthly';

const addPeriod = (date, billingPeriod) => {
  const nextDate = new Date(date);

  if (billingPeriod === 'yearly') {
    nextDate.setFullYear(nextDate.getFullYear() + 1);
    return nextDate;
  }

  nextDate.setMonth(nextDate.getMonth() + 1);
  return nextDate;
};

const normalizeBillingPeriod = (billingPeriod) => {
  if (!billingPeriod) {
    return defaultBillingPeriod;
  }

  if (!['monthly', 'yearly'].includes(billingPeriod)) {
    throw new AppError(400, 'Unsupported billing period', 'invalid_billing_period');
  }

  return billingPeriod;
};

const normalizeAmount = (amount) => {
  if (amount === undefined || amount === null) {
    return defaultAmount;
  }

  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new AppError(400, 'Subscription amount must be positive', 'invalid_subscription_amount');
  }

  return numericAmount;
};

const paymentPayload = (amount, customerId) => ({
  amount,
  status: 'pending_provider_confirmation',
  grace_days: 3,
  provider: 'kaspi_placeholder',
  provider_token: `placeholder-recurring:${customerId}`,
  note: 'first charge confirmed by provider webhook; recurring handled by provider token',
});

export const createSubscription = async ({ user, body }) => {
  const customer = await findCustomerByUserId(user.id);

  if (!customer) {
    throw new AppError(404, 'Customer was not found', 'customer_not_found');
  }

  const billingPeriod = normalizeBillingPeriod(body.billing_period);
  const amount = normalizeAmount(body.amount);
  const expiresAt = addPeriod(new Date(), billingPeriod);

  const result = await createSubscriptionForCustomer({
    customerId: customer.id,
    amount,
    billingPeriod,
    expiresAt,
  });

  if (result.alreadyActive) {
    throw new AppError(409, 'Subscription is already active', 'subscription_already_active');
  }

  return {
    subscription: result.subscription,
    payment: paymentPayload(amount, customer.id),
  };
};

export const renewSubscription = async ({ customerId }) => {
  const customer = await findCustomerById(customerId);

  if (!customer) {
    throw new AppError(404, 'Customer was not found', 'customer_not_found');
  }

  const currentExpiresAt = customer.latest_expires_at || customer.subscription_end_date;
  const billingPeriod = customer.latest_billing_period || defaultBillingPeriod;
  const baseDate = currentExpiresAt && new Date(currentExpiresAt) > new Date()
    ? new Date(currentExpiresAt)
    : new Date();

  const subscription = await renewSubscriptionForCustomer({
    customerId,
    expiresAt: addPeriod(baseDate, billingPeriod),
  });

  return { subscription };
};

export const cancelSubscription = async ({ user, customerId, body }) => {
  const customer = await findCustomerById(customerId);

  if (!customer) {
    throw new AppError(404, 'Customer was not found', 'customer_not_found');
  }

  const isAdminCustomers = user.role === ROLES.adminCustomers;
  const isOwnCustomer = user.role === ROLES.customer && customer.user_id === user.id;

  if (!isAdminCustomers && !isOwnCustomer) {
    throw new AppError(403, 'Access denied', 'access_denied');
  }

  const subscription = await cancelSubscriptionForCustomer({
    customerId,
    immediate: body.immediate === true,
  });

  if (!subscription) {
    throw new AppError(404, 'Active subscription was not found', 'subscription_not_found');
  }

  return { subscription };
};

export const listSubscriptions = async ({ query }) => {
  const subscriptions = await listSubscriptionsWithCustomers({
    storeId: query.store_id,
    status: query.status,
  });

  return { subscriptions };
};
