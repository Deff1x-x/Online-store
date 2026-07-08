import { AppError } from '../../utils/AppError.js';
import * as repository from './notifications.repository.js';

const queueNotification = async ({ channel, body }) => {
  const recipient = String(body.recipient || '').trim();

  if (!recipient) {
    throw new AppError(400, 'recipient is required', 'recipient_required');
  }

  const notification = await repository.insertNotification({
    channel,
    recipient,
    templateKey: body.template_key || null,
    payload: body.payload || {},
  });

  return {
    message: 'queued for delivery worker',
    notification,
  };
};

export const sendSmsNotification = async ({ body }) => queueNotification({ channel: 'sms', body });
export const sendEmailNotification = async ({ body }) => queueNotification({ channel: 'email', body });
