import { sendControllerError } from '../../../utils/http.js';
import * as catalogService from './catalog.service.js';

const run = (serviceCall, fallbackMessage, statusCode = 200) => async (request, response) => {
  try {
    const result = await serviceCall({ user: request.user, params: request.params, query: request.query, body: request.body });
    return response.status(statusCode).json(result);
  } catch (error) {
    return sendControllerError(response, error, fallbackMessage);
  }
};

export const listStores = run(catalogService.listStores, 'Failed to fetch admin catalog stores');
export const createStore = run(catalogService.createStore, 'Failed to create admin catalog store', 201);
export const updateStore = run(catalogService.updateStore, 'Failed to update admin catalog store');
export const deleteStore = run(catalogService.deleteStore, 'Failed to delete admin catalog store');
export const createCoverage = run(catalogService.createCoverage, 'Failed to create admin catalog coverage', 201);
export const listProducts = run(catalogService.listProducts, 'Failed to fetch admin catalog products');
export const createProduct = run(catalogService.createProduct, 'Failed to create admin catalog product', 201);
export const updateProduct = run(catalogService.updateProduct, 'Failed to update admin catalog product');
export const deleteProduct = run(catalogService.deleteProduct, 'Failed to delete admin catalog product');
export const listStoreInventory = run(catalogService.listStoreInventory, 'Failed to fetch admin catalog inventory');
export const updateStoreInventory = run(catalogService.updateStoreInventory, 'Failed to update admin catalog inventory');
export const receiveStoreInventory = run(catalogService.receiveStoreInventory, 'Failed to receive admin catalog inventory', 201);
export const listPromoCodes = run(catalogService.listPromoCodes, 'Failed to fetch admin catalog promo codes');
export const createPromoCode = run(catalogService.createPromoCode, 'Failed to create admin catalog promo code', 201);
export const updatePromoCode = run(catalogService.updatePromoCode, 'Failed to update admin catalog promo code');
export const deletePromoCode = run(catalogService.deletePromoCode, 'Failed to delete admin catalog promo code');
export const getDeliverySettings = run(catalogService.getDeliverySettings, 'Failed to fetch admin catalog delivery settings');
export const updateDeliverySettings = run(catalogService.updateDeliverySettings, 'Failed to update admin catalog delivery settings');
