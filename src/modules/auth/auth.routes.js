import { Router } from 'express';
import {
  loginCustomer,
  loginStaff,
  registerCustomer,
  sendOTP,
} from './auth.controller.js';

const router = Router();

router.post('/otp', sendOTP);
router.post('/register-phone', sendOTP);
router.post('/register', registerCustomer);
router.post('/verify-otp', loginCustomer);
router.post('/login', loginCustomer);
router.post('/staff/login', loginStaff);
router.post('/login-admin', loginStaff);

export default router;
