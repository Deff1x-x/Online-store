import { Router } from 'express';
import {
  loginCustomer,
  loginStaff,
  registerCustomer,
  sendOTP,
} from './auth.controller.js';

const router = Router();

router.post('/otp', sendOTP);
router.post('/register', registerCustomer);
router.post('/login', loginCustomer);
router.post('/staff/login', loginStaff);

export default router;
