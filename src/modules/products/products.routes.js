import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middleware/auth.js';
import { ROLES } from '../../utils/roles.js';
import {
  adminCreateProduct,
  adminLinkProductToStore,
  getStoreCatalog,
} from './products.controller.js';

const router = Router();

router.get('/store/:store_id', getStoreCatalog);
router.post('/', authenticateToken, authorizeRoles(ROLES.adminCatalog), adminCreateProduct);
router.post('/link-store', authenticateToken, authorizeRoles(ROLES.adminCatalog), adminLinkProductToStore);

export default router;
