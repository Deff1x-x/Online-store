import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { normalizeRole } from './roles.js';

const saltRounds = 12;

export const hashPassword = async (password) => {
  // Passwords are never stored in plain text. Bcrypt adds a unique salt per hash.
  return bcrypt.hash(password, saltRounds);
};

export const comparePassword = async (password, hashedPassword) => {
  // Compare the submitted password with the persisted bcrypt hash.
  return bcrypt.compare(password, hashedPassword);
};

export const generateToken = (userPayload) => {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error('JWT_SECRET is not configured');
  }

  // Keep the token payload intentionally small and free of sensitive fields.
  const tokenPayload = {
    id: userPayload.id,
    role: normalizeRole(userPayload.role),
  };

  if (userPayload.store_id) {
    tokenPayload.store_id = userPayload.store_id;
  }

  if (userPayload.email) {
    tokenPayload.email = userPayload.email;
  } else if (userPayload.phone) {
    tokenPayload.phone = userPayload.phone;
  }

  return jwt.sign(tokenPayload, jwtSecret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};
