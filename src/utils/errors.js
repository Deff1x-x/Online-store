import { AppError, isAppError } from './AppError.js';

export const notImplemented = (featureName) => {
  throw new AppError(
    501,
    `${featureName} API is prepared but not implemented yet`,
    'not_implemented',
  );
};

export { AppError, isAppError };
