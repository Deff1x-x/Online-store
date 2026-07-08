import * as service from './admin-catalog.service.js';

const handle = (action) => async (request, response, next) => {
  try {
    const { status = 200, body } = await action(request);
    return response.status(status).json(body);
  } catch (error) {
    return next(error);
  }
};

export const getStores = handle((request) => service.listStores({ query: request.query }));
export const createStore = handle((request) => service.createStore({ body: request.body }));
export const updateStore = handle((request) => service.updateStore({ id: request.params.id, body: request.body }));
export const deleteStore = handle((request) => service.deleteStore({ id: request.params.id }));
export const upsertCoverage = handle((request) => service.upsertCoverage({ body: request.body }));
export const getProducts = handle((request) => service.listProducts({ query: request.query }));
export const createProduct = handle((request) => service.createProduct({ body: request.body }));
export const updateProduct = handle((request) => service.updateProduct({ id: request.params.id, body: request.body }));
export const deleteProduct = handle((request) => service.deleteProduct({ id: request.params.id }));
export const getStoreInventory = handle((request) => service.listStoreInventory({ storeId: request.params.id }));
export const upsertStoreInventory = handle((request) => service.upsertStoreInventory({
  storeId: request.params.id,
  productId: request.params.product_id,
  body: request.body,
}));
export const receiveStoreInventory = handle((request) => service.receiveStoreInventory({
  storeId: request.params.id,
  productId: request.params.product_id,
  body: request.body,
}));
export const getPromoCodes = handle((request) => service.listPromoCodes({ query: request.query }));
export const createPromoCode = handle((request) => service.createPromoCode({ body: request.body }));
export const updatePromoCode = handle((request) => service.updatePromoCode({ id: request.params.id, body: request.body }));
export const deletePromoCode = handle((request) => service.deletePromoCode({ id: request.params.id }));
export const getDeliverySettings = handle((request) => service.getDeliverySettings({ storeId: request.params.store_id }));
export const upsertDeliverySettings = handle((request) => service.upsertDeliverySettings({
  storeId: request.params.store_id,
  body: request.body,
}));
