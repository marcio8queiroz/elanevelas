import { Router } from 'express';
import { health } from '../controllers/health.controller.js';
import { testError } from '../controllers/test.controller.js';
import categoryRoutes from './category.routes.js';
import productRoutes from './product.routes.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import cartRoutes from './cart.routes.js';
import wishlistRoutes from './wishlist.routes.js';
import orderRoutes from './order.routes.js';
import adminOrderRoutes from './adminOrder.routes.js';

import integrationRoutes from './integration.routes.js';

const router = Router();
router.use(integrationRoutes);

router.get('/health', health);
router.get('/test-error', testError);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/cart', cartRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/orders', orderRoutes);
router.use('/admin/orders', adminOrderRoutes);

export default router;
