import { Router } from 'express';
import { health } from '../controllers/health.controller.js';
import { testError } from '../controllers/test.controller.js';

const router = Router();

router.get('/health', health);
router.get('/test-error', testError);

export default router;

