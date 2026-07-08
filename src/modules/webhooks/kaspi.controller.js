import { handleKaspiWebhook } from './kaspi.service.js';

export const kaspiWebhook = async (request, response, next) => {
  try {
    const result = await handleKaspiWebhook({ body: request.body });
    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};
