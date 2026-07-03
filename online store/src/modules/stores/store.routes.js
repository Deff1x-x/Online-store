import { Router } from 'express';
import {
  adminCreateStore,
  getStores,
} from './store.controller.js';
import { authenticateToken } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/role.middleware.js';

const router = Router();

router.get('/', getStores);

// Store creation is restricted to catalog administrators.
router.post(
  '/',
  authenticateToken,
  authorizeRoles('Admin_1_Catalog'),
  adminCreateStore,
);

export default router;
