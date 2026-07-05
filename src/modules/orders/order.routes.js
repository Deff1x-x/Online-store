import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/role.middleware.js';
import { ROLES } from '../../utils/roles.js';
import { payOrderOnline } from '../payments/payments.controller.js';
import { createOrder, validatePromoForOrder } from './order.controller.js';

const router = Router();

router.post(
  '/',
  authenticateToken,
  authorizeRoles(ROLES.customer),
  createOrder,
);

router.post(
  '/:id/pay-online',
  authenticateToken,
  authorizeRoles(ROLES.customer),
  payOrderOnline,
);

router.post(
  '/:id/validate-promo',
  authenticateToken,
  authorizeRoles(ROLES.customer),
  validatePromoForOrder,
);

export default router;
