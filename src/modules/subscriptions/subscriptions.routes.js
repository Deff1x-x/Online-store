import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/role.middleware.js';
import { ROLES } from '../../utils/roles.js';
import {
  cancelSubscription,
  createSubscription,
  getSubscriptions,
  renewSubscription,
} from './subscriptions.controller.js';

const router = Router();

router.get('/', authenticateToken, authorizeRoles(ROLES.adminCustomers), getSubscriptions);
router.post('/', authenticateToken, authorizeRoles(ROLES.customer), createSubscription);
router.post('/:customerId/renew', authenticateToken, authorizeRoles(ROLES.adminCustomers), renewSubscription);
router.post('/:customerId/cancel', authenticateToken, authorizeRoles(ROLES.adminCustomers), cancelSubscription);

export default router;
