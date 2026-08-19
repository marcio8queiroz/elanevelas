import { Router } from 'express';
import { login, logout, refresh, register } from '../controllers/auth.controller.js';
import validate from '../middlewares/validate.middleware.js';
import {
  loginSchema, refreshSchema, registerSchema,
} from '../validations/auth.validation.js';

const router = Router();

router.post('/register', validate({ body: registerSchema }), register);
router.post('/login', validate({ body: loginSchema }), login);
router.post('/refresh', validate({ body: refreshSchema }), refresh);
router.post('/logout', validate({ body: refreshSchema }), logout);

export default router;
