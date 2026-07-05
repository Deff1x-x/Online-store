import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/role.middleware.js';
import { ROLES } from '../../utils/roles.js';
import { getPayments } from './payments.controller.js';

const router = Router();

router.get('/', authenticateToken, authorizeRoles(ROLES.adminOperations), getPayments);

export default router;
