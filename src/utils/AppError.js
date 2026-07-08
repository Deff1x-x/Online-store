export class AppError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.statusCode = status;
    this.code = code;
  }
}

export const isAppError = (error) => {
  return error instanceof AppError;
};
