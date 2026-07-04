import { AppError } from '../../utils/errors.js';
import {
  findCustomerRecordIdForUser,
  findOrderForCustomerById,
  findOrdersForCustomer,
} from './my-orders.repository.js';

const getCustomerScope = async (user) => {
  if (!user?.id) {
    throw new AppError(401, 'Authenticated customer is required', 'customer_auth_required');
  }

  const customerRecordId = await findCustomerRecordIdForUser(user.id);

  return {
    userId: user.id,
    customerRecordId,
  };
};

export const listMyOrders = async ({ user }) => {
  const scope = await getCustomerScope(user);
  const orders = await findOrdersForCustomer(scope);

  return {
    orders,
  };
};

export const getMyOrder = async ({ user, orderId }) => {
  const scope = await getCustomerScope(user);
  const order = await findOrderForCustomerById({
    ...scope,
    orderId,
  });

  if (!order) {
    throw new AppError(404, 'Order was not found', 'order_not_found');
  }

  return {
    order,
  };
};
