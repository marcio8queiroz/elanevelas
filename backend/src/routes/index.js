import { Router } from 'express';
import { health } from '../controllers/health.controller.js';
import { testError } from '../controllers/test.controller.js';
import categoryRoutes from './category.routes.js';
import productRoutes from './product.routes.js';

const router = Router();

router.get('/health', health);
router.get('/test-error', testError);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);

export default router;
