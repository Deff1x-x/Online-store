import { Router } from 'express';
import {
  adminCreateStore,
  getStores,
} from './store.controller.js';
import { authenticateToken } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/role.middleware.js';
import { ROLES } from '../../utils/roles.js';
import { getStoreCoverage } from '../store-coverage/store-coverage.controller.js';
import { getStoreCatalog } from '../products/product.controller.js';

const router = Router();

router.get('/', getStores);

router.get(
  '/:store_id/coverage',
  authenticateToken,
  authorizeRoles(ROLES.customer, ROLES.storeOperator, ROLES.adminCatalog),
  getStoreCoverage,
);

router.get(
  '/:store_id/catalog',
  authenticateToken,
  authorizeRoles(ROLES.customer, ROLES.adminCatalog, ROLES.adminOperations),
  getStoreCatalog,
);

// Store creation is restricted to catalog administrators.
router.post(
  '/',
  authenticateToken,
  authorizeRoles(ROLES.adminCatalog),
  adminCreateStore,
);

export default router;
