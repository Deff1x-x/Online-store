import { comparePassword, generateToken } from '../../utils/auth.js';
import { AppError } from '../../utils/errors.js';
import { normalizeUser, ROLES } from '../../utils/roles.js';
import { ensureCustomerRecordForUser } from '../customers/customers.service.js';
import {
  createCustomerWithConsent,
  findUserByEmail,
  findUserByPhone,
} from './auth.repository.js';

const otpStorage = new Map();
const otpLifetimeMilliseconds = 5 * 60 * 1000;

const generateOtpCode = () => {
  if (process.env.NODE_ENV === 'test') {
    return '1234';
  }

  return String(Math.floor(1000 + Math.random() * 9000));
};

const saveOtpCode = (phone, code) => {
  otpStorage.set(phone, {
    code,
    expiresAt: Date.now() + otpLifetimeMilliseconds,
  });
};

const verifyOtpCode = (phone, code) => {
  const storedOtp = otpStorage.get(phone);

  if (!storedOtp) {
    return false;
  }

  if (storedOtp.expiresAt < Date.now()) {
    otpStorage.delete(phone);
    return false;
  }

  if (storedOtp.code !== code) {
    return false;
  }

  otpStorage.delete(phone);
  return true;
};

export const createOtpChallenge = ({ phone }) => {
  if (!phone) {
    throw new AppError(400, 'Phone number is required', 'phone_required');
  }

  const code = generateOtpCode();
  saveOtpCode(phone, code);

  console.log(`SMS OTP for ${phone}: ${code}`);

  return {
    message: 'OTP code has been sent',
    expires_in_seconds: otpLifetimeMilliseconds / 1000,
  };
};

export const registerCustomer = async ({
  phone,
  code,
  email,
  name,
  store_id,
  privacy_policy,
  terms_of_service,
  ip_address,
  clientIp,
}) => {
  if (!phone || !code || !name || !store_id) {
    throw new AppError(
      400,
      'Phone, OTP code, name and store_id are required',
      'customer_registration_required_fields',
    );
  }

  if (privacy_policy !== true || terms_of_service !== true) {
    throw new AppError(
      400,
      'Privacy policy and terms of service consents are required',
      'consents_required',
    );
  }

  if (!verifyOtpCode(phone, code)) {
    throw new AppError(403, 'Invalid or expired OTP code', 'invalid_otp');
  }

  const consentIpAddress = ip_address || clientIp || '0.0.0.0';

  try {
    const result = await createCustomerWithConsent({
      phone,
      email,
      name,
      storeId: store_id,
      privacyPolicy: privacy_policy,
      termsOfService: terms_of_service,
      ipAddress: consentIpAddress,
    });

    if (result.storeNotFound) {
      throw new AppError(
        400,
        'Selected store does not exist or is not active',
        'store_not_active',
      );
    }

    const user = normalizeUser(result.user);
    await ensureCustomerRecordForUser(user);

    const token = generateToken(user);

    return {
      message: 'Customer registered successfully',
      token,
      user,
    };
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError(
        409,
        'User with this phone or email already exists',
        'duplicate_user_contact',
      );
    }

    throw error;
  }
};

export const loginCustomer = async ({ phone, code }) => {
  if (!phone || !code) {
    throw new AppError(400, 'Phone and OTP code are required', 'login_required_fields');
  }

  if (!verifyOtpCode(phone, code)) {
    throw new AppError(403, 'Invalid or expired OTP code', 'invalid_otp');
  }

  const user = normalizeUser(await findUserByPhone(phone));

  if (!user) {
    throw new AppError(404, 'Customer was not found', 'customer_not_found');
  }

  if (user.role !== ROLES.customer) {
    throw new AppError(403, 'Only customers can log in through phone OTP', 'invalid_login_channel');
  }

  await ensureCustomerRecordForUser(user);

  const token = generateToken(user);

  return {
    message: 'Customer logged in successfully',
    token,
    user,
  };
};

export const loginStaff = async ({ email, password }) => {
  if (!email || !password) {
    throw new AppError(400, 'Email and password are required', 'staff_login_required_fields');
  }

  const user = normalizeUser(await findUserByEmail(email));

  if (!user) {
    throw new AppError(401, 'Invalid email or password', 'invalid_credentials');
  }

  if (user.role === ROLES.customer) {
    throw new AppError(403, 'Customers must log in through phone OTP', 'invalid_login_channel');
  }

  if (!user.password_hash) {
    throw new AppError(403, 'Password login is not configured for this user', 'password_not_configured');
  }

  const passwordMatches = await comparePassword(password, user.password_hash);

  if (!passwordMatches) {
    throw new AppError(401, 'Invalid email or password', 'invalid_credentials');
  }

  const staffUser = {
    id: user.id,
    phone: user.phone,
    email: user.email,
    name: user.name,
    store_id: user.store_id,
    role: user.role,
  };

  const token = generateToken(staffUser);

  return {
    message: 'Staff user logged in successfully',
    token,
    user: staffUser,
  };
};
