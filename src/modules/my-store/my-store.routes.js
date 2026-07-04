import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/role.middleware.js';
import { ROLES } from '../../utils/roles.js';
import {
  getAnalytics,
  getInventory,
  getOrders,
  pickOrder,
  receiveInventory,
  recordActualWeight,
  updateInventory,
  updateOrderStatus,
} from './my-store.controller.js';

const router = Router();
const storeOperatorOnly = [authenticateToken, authorizeRoles(ROLES.storeOperator)];

router.get('/orders', ...storeOperatorOnly, getOrders);
router.put('/orders/:id/pick', ...storeOperatorOnly, pickOrder);
router.put('/orders/:id/status', ...storeOperatorOnly, updateOrderStatus);
router.put('/orders/:id/actual-weight', ...storeOperatorOnly, recordActualWeight);
router.get('/inventory', ...storeOperatorOnly, getInventory);
router.put('/inventory/:product_id', ...storeOperatorOnly, updateInventory);
router.post('/inventory/:product_id/incoming', ...storeOperatorOnly, receiveInventory);
router.get('/analytics', ...storeOperatorOnly, getAnalytics);

export default router;
