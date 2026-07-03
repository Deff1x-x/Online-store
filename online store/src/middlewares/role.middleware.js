export const authorizeRoles = (...allowedRoles) => {
  return (request, response, next) => {
    const userRole = request.user?.role;

    if (!userRole) {
      return response.status(403).json({
        message: 'Access denied: authenticated user role is missing',
      });
    }

    // RBAC gate: only explicitly allowed roles can access the protected route.
    if (!allowedRoles.includes(userRole)) {
      return response.status(403).json({
        message: 'Access denied: you do not have permission to access this resource',
      });
    }

    return next();
  };
};
