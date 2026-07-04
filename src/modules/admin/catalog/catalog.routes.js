import { Router } from 'express';
import { authenticateToken } from '../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../middlewares/role.middleware.js';
import { ROLES } from '../../../utils/roles.js';
import * as catalogController from './catalog.controller.js';

const router = Router();
const catalogOnly = [authenticateToken, authorizeRoles(ROLES.adminCatalog)];
const catalogOrOperations = [authenticateToken, authorizeRoles(ROLES.adminCatalog, ROLES.adminOperations)];

router.get('/stores', ...catalogOnly, catalogController.listStores);
router.post('/stores', ...catalogOnly, catalogController.createStore);
router.put('/stores/:id', ...catalogOnly, catalogController.updateStore);
router.delete('/stores/:id', ...catalogOnly, catalogController.deleteStore);
router.post('/coverage', ...catalogOnly, catalogController.createCoverage);
router.get('/products', ...catalogOrOperations, catalogController.listProducts);
router.post('/products', ...catalogOnly, catalogController.createProduct);
router.put('/products/:id', ...catalogOnly, catalogController.updateProduct);
router.delete('/products/:id', ...catalogOnly, catalogController.deleteProduct);
router.get('/stores/:id/inventory', ...catalogOrOperations, catalogController.listStoreInventory);
router.put('/stores/:id/inventory/:product_id', ...catalogOnly, catalogController.updateStoreInventory);
router.post('/stores/:id/inventory/:product_id/incoming', ...catalogOnly, catalogController.receiveStoreInventory);
router.get('/promo-codes', ...catalogOrOperations, catalogController.listPromoCodes);
router.post('/promo-codes', ...catalogOnly, catalogController.createPromoCode);
router.put('/promo-codes/:id', ...catalogOnly, catalogController.updatePromoCode);
router.delete('/promo-codes/:id', ...catalogOnly, catalogController.deletePromoCode);
router.get('/delivery-settings/:store_id', ...catalogOnly, catalogController.getDeliverySettings);
router.put('/delivery-settings/:store_id', ...catalogOnly, catalogController.updateDeliverySettings);

export default router;
