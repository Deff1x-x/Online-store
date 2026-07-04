import { notImplemented } from '../../../utils/errors.js';
import {
  createProduct as createCatalogProduct,
  linkProductToStore,
} from '../../products/product.service.js';

export const listStores = async () => notImplemented('Admin catalog stores');
export const createStore = async () => notImplemented('Admin catalog store creation');
export const updateStore = async () => notImplemented('Admin catalog store update');
export const deleteStore = async () => notImplemented('Admin catalog store deletion');
export const createCoverage = async () => notImplemented('Admin catalog coverage');
export const listProducts = async () => notImplemented('Admin catalog products');
export const createProduct = async ({ body }) => createCatalogProduct(body);
export const updateProduct = async () => notImplemented('Admin catalog product update');
export const deleteProduct = async () => notImplemented('Admin catalog product deletion');
export const listStoreInventory = async () => notImplemented('Admin catalog store inventory');
export const updateStoreInventory = async ({ params, body }) => linkProductToStore({
  ...body,
  store_id: params.id,
  product_id: params.product_id,
});
export const receiveStoreInventory = async () => notImplemented('Admin catalog inventory incoming stock');
export const listPromoCodes = async () => notImplemented('Admin catalog promo codes');
export const createPromoCode = async () => notImplemented('Admin catalog promo code creation');
export const updatePromoCode = async () => notImplemented('Admin catalog promo code update');
export const deletePromoCode = async () => notImplemented('Admin catalog promo code deletion');
export const getDeliverySettings = async () => notImplemented('Admin catalog delivery settings');
export const updateDeliverySettings = async () => notImplemented('Admin catalog delivery settings update');
