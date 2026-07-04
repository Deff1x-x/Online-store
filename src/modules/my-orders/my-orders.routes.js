import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/role.middleware.js';
import { ROLES } from '../../utils/roles.js';
import { getMyOrder, getMyOrders } from './my-orders.controller.js';

const router = Router();

router.get('/', authenticateToken, authorizeRoles(ROLES.customer), getMyOrders);
router.get('/:id', authenticateToken, authorizeRoles(ROLES.customer), getMyOrder);

export default router;
