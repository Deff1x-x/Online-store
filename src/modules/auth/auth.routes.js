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
router.post('/register-phone', registerCustomer);
router.post('/login', loginCustomer);
router.post('/verify-otp', loginCustomer);
router.post('/staff/login', loginStaff);
router.post('/login-admin', loginStaff);
router.post('/refresh', refresh);

export default router;
