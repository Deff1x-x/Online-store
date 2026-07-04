import { sendControllerError } from '../../utils/http.js';
import {
  createPromoCode as createPromoCodeService,
  listPromoCodes,
  validatePromoCode as validatePromoCodeService,
} from './promocodes.service.js';

export const validatePromoCode = async (request, response) => {
  try {
    const result = await validatePromoCodeService({ user: request.user, body: request.body });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to validate promo code');
  }
};

export const getPromoCodes = async (request, response) => {
  try {
    const result = await listPromoCodes({ user: request.user, query: request.query });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to fetch promo codes');
  }
};

export const createPromoCode = async (request, response) => {
  try {
    const result = await createPromoCodeService({ user: request.user, body: request.body });
    return response.status(201).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to create promo code');
  }
};
