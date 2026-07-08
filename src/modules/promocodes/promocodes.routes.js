import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middleware/auth.js';
import { ROLES } from '../../utils/roles.js';
import {
  createPromoCode,
  getPromoCodes,
  validatePromoCode,
} from './promocodes.controller.js';

const router = Router();

router.post('/validate', authenticateToken, authorizeRoles(ROLES.customer), validatePromoCode);
router.get('/', authenticateToken, authorizeRoles(ROLES.adminCatalog), getPromoCodes);
router.post('/', authenticateToken, authorizeRoles(ROLES.adminCatalog), createPromoCode);

export default router;
