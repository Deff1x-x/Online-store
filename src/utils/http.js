import { isAppError } from './errors.js';

export const sendControllerError = (response, error, fallbackMessage) => {
  if (isAppError(error)) {
    return response.status(error.statusCode).json({
      message: error.message,
      code: error.code,
    });
  }

  console.error(fallbackMessage, error);

  return response.status(500).json({
    message: fallbackMessage,
  });
};
