import {
  sendEmailNotification,
  sendSmsNotification,
} from './notifications.service.js';

const handle = (action) => async (request, response, next) => {
  try {
    return response.status(202).json(await action(request));
  } catch (error) {
    return next(error);
  }
};

export const sendSms = handle((request) => sendSmsNotification({ user: request.user, body: request.body }));
export const sendEmail = handle((request) => sendEmailNotification({ user: request.user, body: request.body }));
