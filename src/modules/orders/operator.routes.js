import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/role.middleware.js';
import { ROLES } from '../../utils/roles.js';
import {
  getOperatorOrders,
  pickOrder,
  recordActualWeight,
  updateDeliveryStatus,
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

router.put(
  '/:id/status',
  authenticateToken,
  authorizeRoles(ROLES.storeOperator),
  updateDeliveryStatus,
);

router.put(
  '/:id/actual-weight',
  authenticateToken,
  authorizeRoles(ROLES.storeOperator),
  recordActualWeight,
);

export default router;
