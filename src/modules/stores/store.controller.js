import { sendControllerError } from '../../utils/http.js';
import {
  createStore,
  getStores as getStoresService,
} from './store.service.js';

export const adminCreateStore = async (request, response) => {
  try {
    const result = await createStore(request.body);
    return response.status(201).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to create store');
  }
};

export const getStores = async (request, response) => {
  try {
    const result = await getStoresService();
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to fetch stores');
  }
};
