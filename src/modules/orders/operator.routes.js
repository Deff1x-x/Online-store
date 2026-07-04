import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/role.middleware.js';
import { ROLES } from '../../utils/roles.js';
import {
  getOperatorOrders,
  pickOrder,
} from './operator.controller.js';

const router = Router();

router.get(
  '/',
  authenticateToken,
  authorizeRoles(ROLES.storeOperator),
  getOperatorOrders,
);

router.put(
  '/:id/pick',
  authenticateToken,
  authorizeRoles(ROLES.storeOperator),
  pickOrder,
);

export default router;
