import { sendControllerError } from '../../utils/http.js';
import {
  cancelSubscription as cancelSubscriptionService,
  createSubscription as createSubscriptionService,
  listSubscriptions,
  renewSubscription as renewSubscriptionService,
} from './subscriptions.service.js';

export const getSubscriptions = async (request, response) => {
  try {
    const result = await listSubscriptions({ user: request.user, query: request.query });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to fetch subscriptions');
  }
};

export const createSubscription = async (request, response) => {
  try {
    const result = await createSubscriptionService({ user: request.user, body: request.body });
    return response.status(201).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to create subscription');
  }
};

export const renewSubscription = async (request, response) => {
  try {
    const result = await renewSubscriptionService({ user: request.user, customerId: request.params.customerId });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to renew subscription');
  }
};

export const cancelSubscription = async (request, response) => {
  try {
    const result = await cancelSubscriptionService({ user: request.user, customerId: request.params.customerId, body: request.body });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to cancel subscription');
  }
};
