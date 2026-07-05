import express from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/auth.routes.js';
import orderRoutes from './modules/orders/order.routes.js';
import operatorRoutes from './modules/orders/operator.routes.js';
import productRoutes from './modules/products/product.routes.js';
import storeRoutes from './modules/stores/store.routes.js';
import myProfileRoutes from './modules/my-profile/my-profile.routes.js';
import myOrdersRoutes from './modules/my-orders/my-orders.routes.js';
import myAddressesRoutes from './modules/my-addresses/my-addresses.routes.js';
import myStoreRoutes from './modules/my-store/my-store.routes.js';
import paymentRoutes from './modules/payments/payments.routes.js';
import adminPaymentRoutes from './modules/payments/admin-payments.routes.js';
import promocodeRoutes from './modules/promocodes/promocodes.routes.js';
import subscriptionRoutes from './modules/subscriptions/subscriptions.routes.js';
import notificationRoutes from './modules/notifications/notifications.routes.js';
import adminCatalogRoutes from './modules/admin/catalog/catalog.routes.js';
import adminCustomersRoutes from './modules/admin/customers/customers.routes.js';
import adminOperationsRoutes from './modules/admin/operations/operations.routes.js';
import kaspiWebhookRoutes from './modules/webhooks/kaspi.routes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/operator/orders', operatorRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/my-profile', myProfileRoutes);
app.use('/api/my-orders', myOrdersRoutes);
app.use('/api/my-addresses', myAddressesRoutes);
app.use('/api/my-store', myStoreRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/promocodes', promocodeRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin/catalog', adminCatalogRoutes);
app.use('/api/admin/customers', adminCustomersRoutes);
app.use('/api/admin/payments', adminPaymentRoutes);
app.use('/api/admin/operations', adminOperationsRoutes);
app.use('/webhooks/kaspi', kaspiWebhookRoutes);

app.get('/api/health', (request, response) => {
  response.status(200).json({
    status: 'ok',
    service: 'multi-tenant-ecommerce-backend',
    timestamp: new Date().toISOString(),
  });
});

export default app;
