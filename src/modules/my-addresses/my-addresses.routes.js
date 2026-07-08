import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middleware/auth.js';
import { ROLES } from '../../utils/roles.js';
import {
  createAddress,
  deleteAddress,
  getAddresses,
} from './my-addresses.controller.js';

const router = Router();

router.get('/', authenticateToken, authorizeRoles(ROLES.customer), getAddresses);
router.post('/', authenticateToken, authorizeRoles(ROLES.customer), createAddress);
router.delete('/:id', authenticateToken, authorizeRoles(ROLES.customer), deleteAddress);

export default router;
