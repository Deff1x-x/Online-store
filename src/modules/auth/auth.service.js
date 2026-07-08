import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { comparePassword } from '../../utils/auth.js';
import { AppError } from '../../utils/AppError.js';
import { normalizeUser, ROLES } from '../../utils/roles.js';
import {
  createCustomerRegistration,
  createUserSession,
  findCustomerUserByPhone,
  findStaffUserByEmail,
  rotateRefreshSession,
} from './auth.repository.js';

const otpStorage = new Map();
const otpLifetimeSeconds = 300;
const otpLifetimeMilliseconds = otpLifetimeSeconds * 1000;
const refreshTokenLifetimeDays = 30;

const normalizePhone = (phone) => String(phone || '').trim();

const generateOtpCode = () => {
  if (process.env.NODE_ENV === 'test') {
    return '1234';
  }

  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
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

  if (storedOtp.code !== String(code)) {
    return false;
  }

  otpStorage.delete(phone);
  return true;
};

const publicUser = (user) => {
  const normalizedUser = normalizeUser(user);

  return {
    id: normalizedUser.id,
    phone: normalizedUser.phone,
    email: normalizedUser.email,
    name: normalizedUser.name,
    store_id: normalizedUser.store_id,
    role: normalizedUser.role,
    customer_id: normalizedUser.customer_id,
    subscription_status: normalizedUser.subscription_status,
  };
};

const createAccessToken = (user) => {
  const tokenPayload = {
    id: user.id,
    role: user.role,
  };

  if (user.store_id) {
    tokenPayload.store_id = user.store_id;
  }

  if (user.customer_id) {
    tokenPayload.customer_id = user.customer_id;
  }

  if (user.email) {
    tokenPayload.email = user.email;
  }

  if (user.phone) {
    tokenPayload.phone = user.phone;
  }

  return jwt.sign(tokenPayload, env.jwtSecret, { expiresIn: '15m' });
};

const generateRefreshToken = () => crypto.randomBytes(48).toString('base64url');

const hashRefreshToken = (refreshToken) => {
  return crypto.createHash('sha256').update(refreshToken).digest('hex');
};

const refreshTokenExpiresAt = () => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + refreshTokenLifetimeDays);
  return expiresAt;
};

const issueCustomerTokens = async ({ user, userAgent, ipAddress }) => {
  const safeUser = publicUser(user);
  const token = createAccessToken(safeUser);
  const refreshToken = generateRefreshToken();

  await createUserSession({
    userId: safeUser.id,
    refreshTokenHash: hashRefreshToken(refreshToken),
    userAgent,
    ipAddress,
    expiresAt: refreshTokenExpiresAt(),
  });

  return {
    token,
    refresh_token: refreshToken,
    user: safeUser,
  };
};

export const createOtpChallenge = ({ phone }) => {
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    throw new AppError(400, 'Phone number is required', 'phone_required');
  }

  const code = generateOtpCode();
  saveOtpCode(normalizedPhone, code);

  console.log(`SMS OTP for ${normalizedPhone}: ${code}`);

  return {
    message: 'OTP code has been sent',
    expires_in_seconds: otpLifetimeSeconds,
  };
};

export const registerCustomer = async ({
  phone,
  code,
  name,
  store_id,
  privacy_policy,
  terms_of_service,
  ipAddress,
  userAgent,
}) => {
  const normalizedPhone = normalizePhone(phone);

  if (privacy_policy !== true || terms_of_service !== true) {
    throw new AppError(400, 'Privacy policy and terms of service consents are required', 'consents_required');
  }

  if (!normalizedPhone || !code || !name || !store_id) {
    throw new AppError(400, 'Phone, OTP code, name and store_id are required', 'registration_required_fields');
  }

  if (!verifyOtpCode(normalizedPhone, code)) {
    throw new AppError(403, 'Invalid or expired OTP code', 'invalid_otp');
  }

  try {
    const result = await createCustomerRegistration({
      phone: normalizedPhone,
      name,
      storeId: store_id,
      privacyPolicy: privacy_policy,
      termsOfService: terms_of_service,
      ipAddress,
      userAgent,
    });

    if (result.storeNotFound) {
      throw new AppError(400, 'Selected store does not exist or is not active', 'store_not_active');
    }

    return issueCustomerTokens({ user: result.user, userAgent, ipAddress });
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError(409, 'User with this phone already exists', 'duplicate_user_contact');
    }

    throw error;
  }
};

export const loginCustomer = async ({ phone, code, ipAddress, userAgent }) => {
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone || !code) {
    throw new AppError(400, 'Phone and OTP code are required', 'login_required_fields');
  }

  if (!verifyOtpCode(normalizedPhone, code)) {
    throw new AppError(403, 'Invalid or expired OTP code', 'invalid_otp');
  }

  const user = normalizeUser(await findCustomerUserByPhone(normalizedPhone));

  if (!user || user.role !== ROLES.customer) {
    throw new AppError(404, 'Customer was not found', 'customer_not_found');
  }

  return issueCustomerTokens({ user, userAgent, ipAddress });
};

export const loginStaff = async ({ email, password }) => {
  if (!email || !password) {
    throw new AppError(400, 'Email and password are required', 'staff_login_required_fields');
  }

  const user = normalizeUser(await findStaffUserByEmail(email));

  if (!user || user.role === ROLES.customer) {
    throw new AppError(401, 'Invalid email or password', 'invalid_credentials');
  }

  if (!user.password_hash) {
    throw new AppError(403, 'Password login is not configured for this user', 'password_not_configured');
  }

  const passwordMatches = await comparePassword(password, user.password_hash);

  if (!passwordMatches) {
    throw new AppError(401, 'Invalid email or password', 'invalid_credentials');
  }

  const safeUser = publicUser(user);

  return {
    token: createAccessToken(safeUser),
    user: {
      id: safeUser.id,
      email: safeUser.email,
      name: safeUser.name,
      role: safeUser.role,
      store_id: safeUser.store_id,
    },
  };
};

export const refreshTokens = async ({ refresh_token, ipAddress, userAgent }) => {
  if (!refresh_token) {
    throw new AppError(400, 'Refresh token is required', 'refresh_token_required');
  }

  const newRefreshToken = generateRefreshToken();
  const user = await rotateRefreshSession({
    refreshTokenHash: hashRefreshToken(refresh_token),
    newRefreshTokenHash: hashRefreshToken(newRefreshToken),
    userAgent,
    ipAddress,
    expiresAt: refreshTokenExpiresAt(),
  });

  if (!user) {
    throw new AppError(401, 'Invalid or expired refresh token', 'invalid_refresh_token');
  }

  const safeUser = publicUser(user);

  return {
    token: createAccessToken(safeUser),
    refresh_token: newRefreshToken,
    user: safeUser,
  };
};
