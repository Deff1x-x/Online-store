import { Router } from 'express';
import {
  loginCustomer,
  loginStaff,
  refresh,
  registerCustomer,
  sendOtp,
} from './auth.controller.js';

const router = Router();

router.post('/otp', sendOtp);
router.post('/register', registerCustomer);
router.post('/login', loginCustomer);
router.post('/staff/login', loginStaff);
router.post('/refresh', refresh);

export default router;
