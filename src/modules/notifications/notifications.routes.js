import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { sendEmail, sendSms } from './notifications.controller.js';

const router = Router();

router.post('/sms', authenticateToken, sendSms);
router.post('/email', authenticateToken, sendEmail);

export default router;
