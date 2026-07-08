import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middleware/auth.js';
import { ROLES } from '../../utils/roles.js';
import {
  createOrder,
  getMyOrder,
  getMyOrders,
} from './orders.controller.js';

export const ordersRoutes = Router();
export const myOrdersRoutes = Router();

ordersRoutes.post('/', authenticateToken, authorizeRoles(ROLES.customer), createOrder);

myOrdersRoutes.get('/', authenticateToken, authorizeRoles(ROLES.customer), getMyOrders);
myOrdersRoutes.get('/:id', authenticateToken, authorizeRoles(ROLES.customer), getMyOrder);
