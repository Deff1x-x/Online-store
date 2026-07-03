import { pool, query } from '../../config/db.js';
import { comparePassword, generateToken } from '../../utils/auth.js';

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

  // OTP is single-use, so a successful verification consumes it immediately.
  otpStorage.delete(phone);
  return true;
};

export const sendOTP = async (request, response) => {
  const { phone } = request.body;

  if (!phone) {
    return response.status(400).json({
      message: 'Phone number is required',
    });
  }

  const code = generateOtpCode();
  saveOtpCode(phone, code);

  console.log(`SMS OTP for ${phone}: ${code}`);

  return response.status(200).json({
    message: 'OTP code has been sent',
    expires_in_seconds: otpLifetimeMilliseconds / 1000,
  });
};

export const registerCustomer = async (request, response) => {
  const {
    phone,
    code,
    email,
    name,
    store_id,
    privacy_policy,
    terms_of_service,
    ip_address,
  } = request.body;

  if (!phone || !code || !name || !store_id) {
    return response.status(400).json({
      message: 'Phone, OTP code, name and store_id are required',
    });
  }

  if (privacy_policy !== true || terms_of_service !== true) {
    return response.status(400).json({
      message: 'Privacy policy and terms of service consents are required',
    });
  }

  if (!verifyOtpCode(phone, code)) {
    return response.status(403).json({
      message: 'Invalid or expired OTP code',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const storeResult = await client.query(
      `SELECT id
       FROM stores
       WHERE id = $1 AND status = 'active'`,
      [store_id],
    );

    if (storeResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return response.status(400).json({
        message: 'Selected store does not exist or is not active',
      });
    }

    const userResult = await client.query(
      `INSERT INTO users (phone, email, name, store_id, role)
       VALUES ($1, $2, $3, $4, 'Customer')
       RETURNING id, phone, email, name, store_id, role`,
      [phone, email || null, name, store_id],
    );

    const user = userResult.rows[0];
    const consentIpAddress = ip_address || request.ip || '0.0.0.0';

    await client.query(
      `INSERT INTO user_consents (user_id, privacy_policy, terms_of_service, ip)
       VALUES ($1, $2, $3, $4)`,
      [user.id, privacy_policy, terms_of_service, consentIpAddress],
    );

    await client.query('COMMIT');

    const token = generateToken(user);

    return response.status(201).json({
      message: 'Customer registered successfully',
      token,
      user,
    });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      return response.status(409).json({
        message: 'User with this phone or email already exists',
      });
    }

    console.error('Register customer error:', error);
    return response.status(500).json({
      message: 'Failed to register customer',
    });
  } finally {
    client.release();
  }
};

export const loginCustomer = async (request, response) => {
  const { phone, code } = request.body;

  if (!phone || !code) {
    return response.status(400).json({
      message: 'Phone and OTP code are required',
    });
  }

  if (!verifyOtpCode(phone, code)) {
    return response.status(403).json({
      message: 'Invalid or expired OTP code',
    });
  }

  try {
    const result = await query(
      `SELECT id, phone, email, name, store_id, role
       FROM users
       WHERE phone = $1`,
      [phone],
    );

    if (result.rowCount === 0) {
      return response.status(404).json({
        message: 'Customer was not found',
      });
    }

    const user = result.rows[0];

    if (user.role !== 'Customer') {
      return response.status(403).json({
        message: 'Only customers can log in through phone OTP',
      });
    }

    const token = generateToken(user);

    return response.status(200).json({
      message: 'Customer logged in successfully',
      token,
      user,
    });
  } catch (error) {
    console.error('Login customer error:', error);
    return response.status(500).json({
      message: 'Failed to log in customer',
    });
  }
};

export const loginStaff = async (request, response) => {
  const { email, password } = request.body;

  if (!email || !password) {
    return response.status(400).json({
      message: 'Email and password are required',
    });
  }

  try {
    const result = await query(
      `SELECT id, phone, email, name, store_id, password_hash, role
       FROM users
       WHERE email = $1`,
      [email],
    );

    if (result.rowCount === 0) {
      return response.status(401).json({
        message: 'Invalid email or password',
      });
    }

    const user = result.rows[0];

    if (user.role === 'Customer') {
      return response.status(403).json({
        message: 'Customers must log in through phone OTP',
      });
    }

    if (!user.password_hash) {
      return response.status(403).json({
        message: 'Password login is not configured for this user',
      });
    }

    const passwordMatches = await comparePassword(password, user.password_hash);

    if (!passwordMatches) {
      return response.status(401).json({
        message: 'Invalid email or password',
      });
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

    return response.status(200).json({
      message: 'Staff user logged in successfully',
      token,
      user: staffUser,
    });
  } catch (error) {
    console.error('Login staff error:', error);
    return response.status(500).json({
      message: 'Failed to log in staff user',
    });
  }
};
