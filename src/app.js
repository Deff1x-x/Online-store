import express from 'express';
import cors from 'cors';
import adminCatalogRoutes from './modules/admin/catalog/admin-catalog.routes.js';
import adminCustomersRoutes from './modules/admin/customers/admin-customers.routes.js';
import adminOperationsRoutes from './modules/admin/operations/admin-operations.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import myAddressesRoutes from './modules/my-addresses/my-addresses.routes.js';
import myProfileRoutes from './modules/my-profile/my-profile.routes.js';
import myStoreRoutes from './modules/my-store/my-store.routes.js';
import notificationRoutes from './modules/notifications/notifications.routes.js';
import { myOrdersRoutes, ordersRoutes } from './modules/orders/orders.routes.js';
import paymentRoutes from './modules/payments/payments.routes.js';
import productRoutes from './modules/products/products.routes.js';
import promocodeRoutes from './modules/promocodes/promocodes.routes.js';
import subscriptionRoutes from './modules/subscriptions/subscriptions.routes.js';
import kaspiWebhookRoutes from './modules/webhooks/kaspi.routes.js';
import { AppError } from './utils/AppError.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/admin/catalog', adminCatalogRoutes);
app.use('/api/admin/customers', adminCustomersRoutes);
app.use('/api/admin/operations', adminOperationsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/my-addresses', myAddressesRoutes);
app.use('/api/my-profile', myProfileRoutes);
app.use('/api/my-store', myStoreRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/my-orders', myOrdersRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/products', productRoutes);
app.use('/api/promocodes', promocodeRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/webhooks/kaspi', kaspiWebhookRoutes);

app.get('/api/health', (request, response) => {
  response.status(200).json({
    status: 'ok',
    service: 'koz-backend',
    timestamp: new Date().toISOString(),
  });
});

app.use((request, response, next) => {
  next(new AppError(404, 'Route not found', 'route_not_found'));
});

app.use(errorHandler);

export default app;
