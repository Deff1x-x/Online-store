import { AppError } from '../../utils/errors.js';
import { ROLES } from '../../utils/roles.js';
import {
  findActiveCoverageByStoreId,
  findStoreById,
} from './store-coverage.repository.js';

const assertStoreScopeAccess = ({ user, storeId }) => {
  if (user.role === ROLES.adminCatalog) {
    return;
  }

  if (user.role === ROLES.customer || user.role === ROLES.storeOperator) {
    if (user.store_id !== storeId) {
      throw new AppError(
        403,
        'Access denied: requested store does not match the authenticated user store',
        'store_scope_mismatch',
      );
    }
  }
};

export const getActiveStoreCoverage = async ({ user, storeId }) => {
  if (!storeId) {
    throw new AppError(400, 'store_id is required', 'store_id_required');
  }

  const store = await findStoreById(storeId);

  if (!store) {
    throw new AppError(404, 'Store was not found', 'store_not_found');
  }

  assertStoreScopeAccess({ user, storeId });

  const coverage = await findActiveCoverageByStoreId(storeId);

  return {
    store_id: storeId,
    coverage,
  };
};
