import express from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/auth.routes.js';
import { myOrdersRoutes, ordersRoutes } from './modules/orders/orders.routes.js';
import productRoutes from './modules/products/products.routes.js';
import subscriptionRoutes from './modules/subscriptions/subscriptions.routes.js';
import { AppError } from './utils/AppError.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/my-orders', myOrdersRoutes);
app.use('/api/products', productRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

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
