import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middleware/auth.js';
import { ROLES } from '../../utils/roles.js';
import {
  cancelSubscription,
  createSubscription,
  getSubscriptions,
  renewSubscription,
} from './subscriptions.controller.js';

const router = Router();

router.get(
  '/',
  authenticateToken,
  authorizeRoles(ROLES.adminCatalog, ROLES.adminOperations, ROLES.adminCustomers),
  getSubscriptions,
);
router.post('/', authenticateToken, authorizeRoles(ROLES.customer), createSubscription);
router.post(
  '/:customerId/renew',
  authenticateToken,
  authorizeRoles(ROLES.adminCustomers),
  renewSubscription,
);
router.post('/:customerId/cancel', authenticateToken, cancelSubscription);

export default router;
