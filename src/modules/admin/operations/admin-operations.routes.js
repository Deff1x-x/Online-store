import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../../middleware/auth.js';
import { ROLES } from '../../../utils/roles.js';
import * as controller from './admin-operations.controller.js';

const router = Router();
const adminOperationsOnly = [authenticateToken, authorizeRoles(ROLES.adminOperations)];

router.get('/orders', ...adminOperationsOnly, controller.getOrders);
router.get('/orders/:id', ...adminOperationsOnly, controller.getOrder);
router.put('/orders/:id/status', ...adminOperationsOnly, controller.updateOrderStatus);
router.get('/payments', ...adminOperationsOnly, controller.getPayments);
router.get('/analytics/revenue', ...adminOperationsOnly, controller.getRevenueAnalytics);
router.get('/analytics/delivery', ...adminOperationsOnly, controller.getDeliveryAnalytics);
router.get('/stores/:id/report', ...adminOperationsOnly, controller.getStoreReport);
router.post('/export/orders', ...adminOperationsOnly, controller.exportOrders);
router.get('/promo-codes/:id/usage', ...adminOperationsOnly, controller.getPromoCodeUsage);
router.get('/first-order-discounts', ...adminOperationsOnly, controller.getFirstOrderDiscounts);

export default router;
