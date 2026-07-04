import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/role.middleware.js';
import { ROLES } from '../../utils/roles.js';
import { sendEmail, sendSms } from './notifications.controller.js';

const router = Router();

router.post('/sms', authenticateToken, authorizeRoles(ROLES.adminOperations, ROLES.adminCustomers), sendSms);
router.post('/email', authenticateToken, authorizeRoles(ROLES.adminOperations, ROLES.adminCustomers), sendEmail);

export default router;
