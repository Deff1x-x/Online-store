import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../../middleware/auth.js';
import { ROLES } from '../../../utils/roles.js';
import * as controller from './admin-customers.controller.js';

const router = Router();
const adminCustomersOnly = [authenticateToken, authorizeRoles(ROLES.adminCustomers)];

router.get('/customers', ...adminCustomersOnly, controller.getCustomers);
router.get('/customers/:id', ...adminCustomersOnly, controller.getCustomer);
router.get('/subscriptions', ...adminCustomersOnly, controller.getSubscriptions);
router.put('/customers/:id/subscription/renew', ...adminCustomersOnly, controller.renewSubscription);
router.put('/customers/:id/subscription/cancel', ...adminCustomersOnly, controller.cancelSubscription);
router.put('/customers/:id/subscription/pause', ...adminCustomersOnly, controller.pauseSubscription);
router.get('/audit-logs/consents', ...adminCustomersOnly, controller.getConsentLogs);
router.post('/export/customers', ...adminCustomersOnly, controller.exportCustomers);

export default router;
