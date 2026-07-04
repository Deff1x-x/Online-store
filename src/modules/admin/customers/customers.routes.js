import { Router } from 'express';
import { authenticateToken } from '../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../middlewares/role.middleware.js';
import { ROLES } from '../../../utils/roles.js';
import * as customersController from './customers.controller.js';

const router = Router();
const customersOnly = [authenticateToken, authorizeRoles(ROLES.adminCustomers)];

router.get('/customers', ...customersOnly, customersController.listCustomers);
router.get('/customers/:id', ...customersOnly, customersController.getCustomer);
router.get('/subscriptions', ...customersOnly, customersController.listSubscriptions);
router.put('/customers/:id/subscription/renew', ...customersOnly, customersController.renewSubscription);
router.put('/customers/:id/subscription/cancel', ...customersOnly, customersController.cancelSubscription);
router.put('/customers/:id/subscription/pause', ...customersOnly, customersController.pauseSubscription);
router.get('/audit-logs/consents', ...customersOnly, customersController.listConsentLogs);
router.post('/export/customers', ...customersOnly, customersController.exportCustomers);

export default router;
