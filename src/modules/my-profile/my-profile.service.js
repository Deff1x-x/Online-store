import { notImplemented } from '../../utils/errors.js';
import { getCustomerProfile } from '../customers/customers.service.js';

export const getProfile = async ({ user }) => {
  return getCustomerProfile({ userId: user.id });
};

export const updateProfile = async () => notImplemented('My profile update');
