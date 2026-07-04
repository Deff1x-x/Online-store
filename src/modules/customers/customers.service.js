import { AppError } from '../../utils/errors.js';
import { normalizeRole, ROLES } from '../../utils/roles.js';
import {
  createCustomerRecord,
  findCustomerByStoreAndPhone,
  findCustomerByUserId,
  findUserForCustomerRecord,
} from './customers.repository.js';

const assertCustomerUserCanHaveRecord = (user) => {
  if (!user) {
    throw new AppError(404, 'Customer user was not found', 'customer_user_not_found');
  }

  if (normalizeRole(user.role) !== ROLES.customer) {
    throw new AppError(403, 'Only customer users can have customer records', 'customer_role_required');
  }

  if (!user.store_id) {
    throw new AppError(400, 'Customer user must be assigned to a store', 'customer_store_required');
  }

  if (!user.phone) {
    throw new AppError(400, 'Customer user must have a phone number', 'customer_phone_required');
  }
};

export const ensureCustomerRecordForUser = async (user) => {
  assertCustomerUserCanHaveRecord(user);

  const existingByUserId = await findCustomerByUserId(user.id);

  if (existingByUserId) {
    return existingByUserId;
  }

  const existingByStoreAndPhone = await findCustomerByStoreAndPhone({
    storeId: user.store_id,
    phone: user.phone,
  });

  if (existingByStoreAndPhone?.user_id) {
    return existingByStoreAndPhone;
  }

  return createCustomerRecord({
    userId: user.id,
    phone: user.phone,
    storeId: user.store_id,
    name: user.name,
    email: user.email,
  });
};

export const ensureCustomerRecordForUserId = async (userId) => {
  const user = await findUserForCustomerRecord(userId);
  return ensureCustomerRecordForUser(user);
};

export const getCustomerProfile = async ({ userId }) => {
  const user = await findUserForCustomerRecord(userId);
  const customer = await ensureCustomerRecordForUser(user);

  return {
    id: user.id,
    customer_record_id: customer.id,
    phone: user.phone,
    name: user.name,
    email: user.email,
    store_id: user.store_id,
    subscription_status: customer.subscription_status,
    subscription_start_date: customer.subscription_start_date,
    subscription_end_date: customer.subscription_end_date,
  };
};
