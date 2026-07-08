import { AppError } from '../../../utils/AppError.js';
import {
  cancelSubscription as cancelCustomerSubscription,
  renewSubscription as renewCustomerSubscription,
} from '../../subscriptions/subscriptions.service.js';
import * as repository from './admin-customers.repository.js';

const normalizePositiveInt = (value, fallback) => {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const requireCustomer = async (id) => {
  const customer = await repository.findCustomerById(id);

  if (!customer) {
    throw new AppError(404, 'Customer was not found', 'customer_not_found');
  }

  return customer;
};

export const listCustomers = async ({ query }) => {
  const page = normalizePositiveInt(query.page, 1);
  const limit = Math.min(normalizePositiveInt(query.limit, 20), 100);
  const { customers, total } = await repository.listCustomers({
    storeId: query.store_id,
    subscriptionStatus: query.subscription_status,
    search: query.search,
    page,
    limit,
  });

  return {
    customers,
    pagination: {
      page,
      limit,
      total,
    },
  };
};

export const getCustomer = async ({ id }) => {
  const customer = await requireCustomer(id);
  const [addresses, recentOrders] = await Promise.all([
    repository.findCustomerAddresses(id),
    repository.findRecentOrders(id),
  ]);

  return {
    customer,
    addresses,
    recent_orders: recentOrders,
  };
};

export const listSubscriptions = async ({ query }) => {
  const subscriptions = await repository.listSubscriptions({
    storeId: query.store_id,
    status: query.status,
  });

  return { subscriptions };
};

export const renewSubscription = async ({ customerId }) => {
  await requireCustomer(customerId);
  return renewCustomerSubscription({ customerId });
};

export const cancelSubscription = async ({ user, customerId, body }) => {
  await requireCustomer(customerId);
  return cancelCustomerSubscription({
    user,
    customerId,
    body,
  });
};

export const pauseSubscription = async ({ customerId }) => {
  await requireCustomer(customerId);

  const subscription = await repository.withTransaction((client) => (
    repository.pauseSubscriptionForCustomer(client, customerId)
  ));

  if (!subscription) {
    throw new AppError(404, 'Active subscription was not found', 'subscription_not_found');
  }

  return { subscription };
};

export const listConsentLogs = async () => {
  const auditLogs = await repository.listConsentLogs();
  return { audit_logs: auditLogs };
};

export const exportCustomers = async ({ query }) => {
  const rows = await repository.exportCustomerRows({
    storeId: query.store_id,
    subscriptionStatus: query.subscription_status,
    search: query.search,
  });

  return {
    message: 'Customers export generated',
    format: 'rows',
    generated_at: new Date().toISOString(),
    rows,
  };
};
