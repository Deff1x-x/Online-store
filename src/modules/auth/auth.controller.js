import { sendControllerError } from '../../utils/http.js';
import {
  loginCustomer as loginCustomerService,
  loginStaff as loginStaffService,
  registerCustomer as registerCustomerService,
  createOtpChallenge,
} from './auth.service.js';

export const sendOTP = async (request, response) => {
  try {
    const result = createOtpChallenge(request.body);
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to send OTP code');
  }
};

export const registerCustomer = async (request, response) => {
  try {
    const result = await registerCustomerService({
      ...request.body,
      clientIp: request.ip,
    });

    return response.status(201).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to register customer');
  }
};

export const loginCustomer = async (request, response) => {
  try {
    const result = await loginCustomerService(request.body);
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to log in customer');
  }
};

export const loginStaff = async (request, response) => {
  try {
    const result = await loginStaffService(request.body);
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to log in staff user');
  }
};
