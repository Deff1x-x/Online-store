import express from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/auth.routes.js';
import orderRoutes from './modules/orders/order.routes.js';
import operatorRoutes from './modules/orders/operator.routes.js';
import productRoutes from './modules/products/product.routes.js';
import storeRoutes from './modules/stores/store.routes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/operator/orders', operatorRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stores', storeRoutes);

app.get('/api/health', (request, response) => {
  response.status(200).json({
    status: 'ok',
    service: 'multi-tenant-ecommerce-backend',
    timestamp: new Date().toISOString(),
  });
});

export default app;
