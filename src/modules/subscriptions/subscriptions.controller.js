import {
  cancelSubscription as cancelSubscriptionService,
  createSubscription as createSubscriptionService,
  listSubscriptions,
  renewSubscription as renewSubscriptionService,
} from './subscriptions.service.js';

export const getSubscriptions = async (request, response, next) => {
  try {
    const result = await listSubscriptions({ query: request.query });
    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const createSubscription = async (request, response, next) => {
  try {
    const result = await createSubscriptionService({
      user: request.user,
      body: request.body,
    });

    return response.status(201).json(result);
  } catch (error) {
    return next(error);
  }
};

export const renewSubscription = async (request, response, next) => {
  try {
    const result = await renewSubscriptionService({
      customerId: request.params.customerId,
    });

    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const cancelSubscription = async (request, response, next) => {
  try {
    const result = await cancelSubscriptionService({
      user: request.user,
      customerId: request.params.customerId,
      body: request.body,
    });

    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};
