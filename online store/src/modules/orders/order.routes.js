import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/role.middleware.js';
import { createOrder } from './order.controller.js';

const router = Router();

router.post(
  '/',
  authenticateToken,
  authorizeRoles('Customer'),
  createOrder,
);

export default router;
