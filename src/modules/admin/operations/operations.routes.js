import { Router } from 'express';
import { authenticateToken } from '../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../middlewares/role.middleware.js';
import { ROLES } from '../../../utils/roles.js';
import * as operationsController from './operations.controller.js';

const router = Router();
const operationsOnly = [authenticateToken, authorizeRoles(ROLES.adminOperations)];

router.get('/orders', ...operationsOnly, operationsController.listOrders);
router.get('/orders/:id', ...operationsOnly, operationsController.getOrder);
router.put('/orders/:id/status', ...operationsOnly, operationsController.updateOrderStatus);
router.get('/payments', ...operationsOnly, operationsController.listPayments);
router.get('/analytics/revenue', ...operationsOnly, operationsController.getRevenueAnalytics);
router.get('/analytics/delivery', ...operationsOnly, operationsController.getDeliveryAnalytics);
router.post('/export/orders', ...operationsOnly, operationsController.exportOrders);
router.get('/promo-codes/:id/usage', ...operationsOnly, operationsController.getPromoCodeUsage);
router.get('/first-order-discounts', ...operationsOnly, operationsController.listFirstOrderDiscounts);

export default router;
