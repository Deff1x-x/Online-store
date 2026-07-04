import { sendControllerError } from '../../utils/http.js';
import {
  sendEmailNotification,
  sendSmsNotification,
} from './notifications.service.js';

export const sendSms = async (request, response) => {
  try {
    const result = await sendSmsNotification({ user: request.user, body: request.body });
    return response.status(202).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to send SMS notification');
  }
};

export const sendEmail = async (request, response) => {
  try {
    const result = await sendEmailNotification({ user: request.user, body: request.body });
    return response.status(202).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to send email notification');
  }
};
