import * as service from './admin-customers.service.js';

const handle = (action) => async (request, response, next) => {
  try {
    return response.status(200).json(await action(request));
  } catch (error) {
    return next(error);
  }
};

export const getCustomers = handle((request) => service.listCustomers({ query: request.query }));
export const getCustomer = handle((request) => service.getCustomer({ id: request.params.id }));
export const getSubscriptions = handle((request) => service.listSubscriptions({ query: request.query }));
export const renewSubscription = handle((request) => service.renewSubscription({ customerId: request.params.id }));
export const cancelSubscription = handle((request) => service.cancelSubscription({
  user: request.user,
  customerId: request.params.id,
  body: request.body || {},
}));
export const pauseSubscription = handle((request) => service.pauseSubscription({ customerId: request.params.id }));
export const getConsentLogs = handle(() => service.listConsentLogs());
export const exportCustomers = handle((request) => service.exportCustomers({ query: request.query }));
