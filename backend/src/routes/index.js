import { Router } from 'express';
import { health } from '../controllers/health.controller.js';
import { testError } from '../controllers/test.controller.js';
import categoryRoutes from './category.routes.js';
import productRoutes from './product.routes.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';

const router = Router();

router.get('/health', health);
router.get('/test-error', testError);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);

export default router;
