import express from 'express';
import cors from 'cors';
import { AppError } from './utils/AppError.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json());

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
