import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../../middleware/auth.js';
import { ROLES } from '../../../utils/roles.js';
import * as controller from './admin-catalog.controller.js';

const router = Router();
const adminCatalogOnly = [authenticateToken, authorizeRoles(ROLES.adminCatalog)];

router.get('/stores', ...adminCatalogOnly, controller.getStores);
router.post('/stores', ...adminCatalogOnly, controller.createStore);
router.put('/stores/:id', ...adminCatalogOnly, controller.updateStore);
router.delete('/stores/:id', ...adminCatalogOnly, controller.deleteStore);
router.post('/coverage', ...adminCatalogOnly, controller.upsertCoverage);
router.get('/products', ...adminCatalogOnly, controller.getProducts);
router.post('/products', ...adminCatalogOnly, controller.createProduct);
router.put('/products/:id', ...adminCatalogOnly, controller.updateProduct);
router.delete('/products/:id', ...adminCatalogOnly, controller.deleteProduct);
router.get('/stores/:id/inventory', ...adminCatalogOnly, controller.getStoreInventory);
router.put('/stores/:id/inventory/:product_id', ...adminCatalogOnly, controller.upsertStoreInventory);
router.post('/stores/:id/inventory/:product_id/incoming', ...adminCatalogOnly, controller.receiveStoreInventory);
router.get('/promo-codes', ...adminCatalogOnly, controller.getPromoCodes);
router.post('/promo-codes', ...adminCatalogOnly, controller.createPromoCode);
router.put('/promo-codes/:id', ...adminCatalogOnly, controller.updatePromoCode);
router.delete('/promo-codes/:id', ...adminCatalogOnly, controller.deletePromoCode);
router.get('/delivery-settings/:store_id', ...adminCatalogOnly, controller.getDeliverySettings);
router.put('/delivery-settings/:store_id', ...adminCatalogOnly, controller.upsertDeliverySettings);

export default router;
