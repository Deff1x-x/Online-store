import { sendControllerError } from '../../utils/http.js';
import {
  createProduct,
  getStoreCatalog as getStoreCatalogService,
  linkProductToStore,
} from './product.service.js';

export const adminCreateProduct = async (request, response) => {
  try {
    const result = await createProduct(request.body);
    return response.status(201).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to create product');
  }
};

export const adminLinkProductToStore = async (request, response) => {
  try {
    const result = await linkProductToStore(request.body);
    return response.status(201).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to link product to store');
  }
};

export const getStoreCatalog = async (request, response) => {
  try {
    const result = await getStoreCatalogService({
      storeId: request.params.store_id,
      user: request.user,
    });

    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to fetch store catalog');
  }
};
