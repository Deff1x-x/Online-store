import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/role.middleware.js';
import { ROLES } from '../../utils/roles.js';
import { getPayment, getPayments, payOrderOnline } from './payments.controller.js';

const router = Router();

router.get('/', authenticateToken, authorizeRoles(ROLES.adminOperations), getPayments);
router.get('/:id', authenticateToken, authorizeRoles(ROLES.adminOperations), getPayment);
router.post('/orders/:orderId/pay-online', authenticateToken, authorizeRoles(ROLES.customer), payOrderOnline);

export default router;
