import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/role.middleware.js';
import { ROLES } from '../../utils/roles.js';
import {
  adminCreateProduct,
  adminLinkProductToStore,
  getStoreCatalog,
} from './product.controller.js';

const router = Router();

router.post(
  '/',
  authenticateToken,
  authorizeRoles(ROLES.adminCatalog),
  adminCreateProduct,
);

router.post(
  '/link-store',
  authenticateToken,
  authorizeRoles(ROLES.adminCatalog),
  adminLinkProductToStore,
);

router.get(
  '/store/:store_id',
  authenticateToken,
  getStoreCatalog,
);

export default router;
