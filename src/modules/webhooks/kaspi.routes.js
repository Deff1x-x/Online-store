import { Router } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { kaspiWebhook } from './kaspi.controller.js';

const router = Router();

router.post('/', (request, response, next) => {
  if (env.isProduction) {
    return next(new AppError(503, 'Kaspi webhook is disabled until a provider contract is configured', 'kaspi_webhook_disabled'));
  }

  return kaspiWebhook(request, response, next);
});

export default router;
