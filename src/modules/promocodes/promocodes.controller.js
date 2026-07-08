import {
  createPromoCode as createPromoCodeService,
  listPromoCodes,
  validatePromoCode as validatePromoCodeService,
} from './promocodes.service.js';

export const validatePromoCode = async (request, response, next) => {
  try {
    const result = await validatePromoCodeService({
      user: request.user,
      body: request.body,
    });

    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const getPromoCodes = async (request, response, next) => {
  try {
    const result = await listPromoCodes({ query: request.query });
    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const createPromoCode = async (request, response, next) => {
  try {
    const result = await createPromoCodeService({ body: request.body });
    return response.status(201).json(result);
  } catch (error) {
    return next(error);
  }
};
