import {
  createProduct,
  getStoreCatalog as getStoreCatalogService,
  linkProductToStore,
} from './products.service.js';

export const getStoreCatalog = async (request, response, next) => {
  try {
    const result = await getStoreCatalogService(request.params.store_id);
    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const adminCreateProduct = async (request, response, next) => {
  try {
    const result = await createProduct(request.body);
    return response.status(201).json(result);
  } catch (error) {
    return next(error);
  }
};

export const adminLinkProductToStore = async (request, response, next) => {
  try {
    const result = await linkProductToStore(request.body);
    return response.status(result.created ? 201 : 200).json({
      inventory: result.inventory,
    });
  } catch (error) {
    return next(error);
  }
};
