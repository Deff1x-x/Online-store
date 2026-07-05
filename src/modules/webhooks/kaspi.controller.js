import { sendControllerError } from '../../utils/http.js';
import { handleKaspiWebhook } from '../payments/payments.service.js';

export const kaspiWebhook = async (request, response) => {
  try {
    const result = await handleKaspiWebhook({ body: request.body });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to process Kaspi webhook');
  }
};
