import {
  createOtpChallenge,
  loginCustomer as loginCustomerService,
  loginStaff as loginStaffService,
  refreshTokens,
  registerCustomer as registerCustomerService,
} from './auth.service.js';

export const sendOtp = async (request, response, next) => {
  try {
    const result = createOtpChallenge(request.body);
    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const registerCustomer = async (request, response, next) => {
  try {
    const result = await registerCustomerService({
      ...request.body,
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });

    return response.status(201).json(result);
  } catch (error) {
    return next(error);
  }
};

export const loginCustomer = async (request, response, next) => {
  try {
    const result = await loginCustomerService({
      ...request.body,
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });

    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const loginStaff = async (request, response, next) => {
  try {
    const result = await loginStaffService(request.body);
    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const refresh = async (request, response, next) => {
  try {
    const result = await refreshTokens({
      ...request.body,
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });

    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};
