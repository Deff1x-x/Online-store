export class AppError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const isAppError = (error) => {
  return error instanceof AppError;
};

export const notImplemented = (featureName) => {
  throw new AppError(
    501,
    `${featureName} API is prepared but not implemented yet`,
    'not_implemented',
  );
};
