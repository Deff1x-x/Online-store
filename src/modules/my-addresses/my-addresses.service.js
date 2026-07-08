import { AppError } from '../../utils/AppError.js';
import { ensureCustomerRecordForUserId } from '../customers/customers.service.js';
import {
  createCustomerAddress,
  deleteCustomerAddress,
  findAddressesByCustomerId,
  findCoverageById,
} from './my-addresses.repository.js';

const assertOptionalInteger = (fieldName, value) => {
  if (value === undefined || value === null) {
    return;
  }

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new AppError(
      400,
      `${fieldName} must be an integer number`,
      `invalid_${fieldName}`,
    );
  }
};

export const listAddresses = async ({ user }) => {
  const customer = await ensureCustomerRecordForUserId(user.id);
  const addresses = await findAddressesByCustomerId(customer.id);

  return { addresses };
};

export const createAddress = async ({ user, body }) => {
  const {
    store_coverage_id,
    entrance,
    floor,
    apartment,
    entrance_code,
    is_default,
  } = body;

  if (!store_coverage_id) {
    throw new AppError(
      400,
      'store_coverage_id is required',
      'store_coverage_id_required',
    );
  }

  assertOptionalInteger('entrance', entrance);
  assertOptionalInteger('floor', floor);
  assertOptionalInteger('apartment', apartment);

  const customer = await ensureCustomerRecordForUserId(user.id);
  const coverage = await findCoverageById(store_coverage_id);

  if (!coverage) {
    throw new AppError(404, 'Store coverage was not found', 'store_coverage_not_found');
  }

  if (coverage.active !== true) {
    throw new AppError(400, 'Store coverage is not active', 'store_coverage_inactive');
  }

  if (String(coverage.store_id) !== String(customer.store_id)) {
    throw new AppError(
      403,
      'Store coverage does not belong to the customer store',
      'store_coverage_store_mismatch',
    );
  }

  if (
    entrance !== undefined &&
    entrance !== null &&
    coverage.entrance_count !== null &&
    coverage.entrance_count !== undefined &&
    entrance > Number(coverage.entrance_count)
  ) {
    throw new AppError(
      400,
      'entrance cannot exceed coverage entrance_count',
      'entrance_exceeds_coverage',
    );
  }

  const address = await createCustomerAddress({
    customerId: customer.id,
    storeCoverageId: coverage.id,
    entrance,
    floor,
    apartment,
    entranceCode: entrance_code,
    isDefault: is_default,
  });

  return {
    message: 'Address created successfully',
    address: {
      ...address,
      store_id: coverage.store_id,
      coverage_address: coverage.address,
      entrance_count: coverage.entrance_count,
    },
  };
};

export const deleteAddress = async ({ user, addressId }) => {
  const customer = await ensureCustomerRecordForUserId(user.id);
  const deleted = await deleteCustomerAddress({
    addressId,
    customerId: customer.id,
  });

  if (!deleted) {
    throw new AppError(404, 'Address was not found', 'address_not_found');
  }

  return { message: 'Address deleted successfully' };
};
