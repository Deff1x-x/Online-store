import jwt from 'jsonwebtoken';

export const authenticateToken = (request, response, next) => {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader) {
    return response.status(401).json({
      message: 'Authorization token is required',
    });
  }

  const [scheme, token] = authorizationHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return response.status(401).json({
      message: 'Authorization header must use the Bearer token format',
    });
  }

  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    return response.status(500).json({
      message: 'JWT secret is not configured',
    });
  }

  try {
    // Verified token data becomes available for controllers and RBAC middleware.
    request.user = jwt.verify(token, jwtSecret);
    return next();
  } catch (error) {
    return response.status(403).json({
      message: 'Invalid or expired authorization token',
    });
  }
};
