import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/role.middleware.js';
import { ROLES } from '../../utils/roles.js';
import { getProfile, updateProfile } from './my-profile.controller.js';

const router = Router();

router.get('/', authenticateToken, authorizeRoles(ROLES.customer), getProfile);
router.put('/', authenticateToken, authorizeRoles(ROLES.customer), updateProfile);

export default router;
