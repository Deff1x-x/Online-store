import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { normalizeRole } from '../utils/roles.js';

export const authenticateToken = (request, response, next) => {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader) {
    return next(new AppError(401, 'Authorization token is required', 'token_required'));
  }

  const [scheme, token] = authorizationHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(401, 'Authorization header must use Bearer token', 'invalid_authorization_header'));
  }

  try {
    const verifiedUser = jwt.verify(token, env.jwtSecret);
    request.user = {
      ...verifiedUser,
      role: normalizeRole(verifiedUser.role),
    };
    return next();
  } catch (error) {
    return next(new AppError(403, 'Invalid or expired authorization token', 'invalid_token'));
  }
};

export const authorizeRoles = (...allowedRoles) => {
  return (request, response, next) => {
    const userRole = normalizeRole(request.user?.role);
    const normalizedAllowedRoles = allowedRoles.map(normalizeRole);

    if (!userRole || !normalizedAllowedRoles.includes(userRole)) {
      return next(new AppError(403, 'Access denied', 'access_denied'));
    }

    return next();
  };
};
