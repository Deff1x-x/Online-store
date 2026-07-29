import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middleware/auth.js';
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
router.put('/orders/:id/actual-weight', ...storeOperatorOnly, recordActualWeight);
router.put('/orders/:id/status', ...storeOperatorOnly, updateOrderStatus);
router.get('/inventory', ...storeOperatorOnly, getInventory);
router.put('/inventory/:product_id', ...storeOperatorOnly, updateInventory);
router.post('/inventory/:product_id/incoming', ...storeOperatorOnly, receiveInventory);
// TZ Б4 alias of А5 incoming
router.put('/inventory/:product_id/receive', ...storeOperatorOnly, receiveInventory);
router.get('/analytics', ...storeOperatorOnly, getAnalytics);

export default router;
