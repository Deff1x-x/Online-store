import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middleware/auth.js';
import { ROLES } from '../../utils/roles.js';
import { sendEmail, sendSms } from './notifications.controller.js';

const router = Router();
const notificationQueueAccess = [authenticateToken, authorizeRoles(ROLES.adminOperations)];

router.post('/sms', ...notificationQueueAccess, sendSms);
router.post('/email', ...notificationQueueAccess, sendEmail);

export default router;
