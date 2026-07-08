import { isAppError } from '../utils/AppError.js';

export const errorHandler = (error, request, response, next) => {
  if (response.headersSent) {
    return next(error);
  }

  if (isAppError(error)) {
    return response.status(error.status).json({
      message: error.message,
      code: error.code,
    });
  }

  console.error(error);

  return response.status(500).json({
    message: 'Internal server error',
    code: 'internal_error',
  });
};
