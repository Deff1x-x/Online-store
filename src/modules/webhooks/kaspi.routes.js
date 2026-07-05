import { Router } from 'express';
import { kaspiWebhook } from './kaspi.controller.js';

const router = Router();

router.post('/', kaspiWebhook);

export default router;
