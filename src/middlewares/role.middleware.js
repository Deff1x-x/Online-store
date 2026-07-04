import { normalizeRole } from '../utils/roles.js';

export const authorizeRoles = (...allowedRoles) => {
  return (request, response, next) => {
    const userRole = normalizeRole(request.user?.role);
    const normalizedAllowedRoles = allowedRoles.map(normalizeRole);

    if (!userRole) {
      return response.status(403).json({
        message: 'Access denied: authenticated user role is missing',
      });
    }

    // RBAC gate: only explicitly allowed roles can access the protected route.
    if (!normalizedAllowedRoles.includes(userRole)) {
      return response.status(403).json({
        message: 'Access denied: you do not have permission to access this resource',
      });
    }

    return next();
  };
};
