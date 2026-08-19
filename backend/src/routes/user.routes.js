import { Router } from 'express';
import { getMe, updateMe } from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { updateMeSchema } from '../validations/auth.validation.js';

const router = Router();

router.use(authenticate);
router.route('/me')
  .get(getMe)
  .patch(validate({ body: updateMeSchema }), updateMe);

export default router;
