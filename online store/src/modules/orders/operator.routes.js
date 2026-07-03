import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/role.middleware.js';
import {
  getOperatorOrders,
  pickOrder,
} from './operator.controller.js';

const router = Router();

router.get(
  '/',
  authenticateToken,
  authorizeRoles('Store_Op'),
  getOperatorOrders,
);

router.put(
  '/:id/pick',
  authenticateToken,
  authorizeRoles('Store_Op'),
  pickOrder,
);

export default router;
