import { sendControllerError } from '../../../utils/http.js';
import * as customersService from './customers.service.js';

const run = (serviceCall, fallbackMessage, statusCode = 200) => async (request, response) => {
  try {
    const result = await serviceCall({ user: request.user, params: request.params, query: request.query, body: request.body });
    return response.status(statusCode).json(result);
  } catch (error) {
    return sendControllerError(response, error, fallbackMessage);
  }
};

export const listCustomers = run(customersService.listCustomers, 'Failed to fetch admin customers');
export const getCustomer = run(customersService.getCustomer, 'Failed to fetch admin customer');
export const listSubscriptions = run(customersService.listSubscriptions, 'Failed to fetch admin customer subscriptions');
export const renewSubscription = run(customersService.renewSubscription, 'Failed to renew customer subscription');
export const cancelSubscription = run(customersService.cancelSubscription, 'Failed to cancel customer subscription');
export const pauseSubscription = run(customersService.pauseSubscription, 'Failed to pause customer subscription');
export const listConsentLogs = run(customersService.listConsentLogs, 'Failed to fetch consent logs');
export const exportCustomers = run(customersService.exportCustomers, 'Failed to export customers', 202);
