import { Router } from 'express';
import { verifyToken } from '../middleware/verifyToken.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../validators/auth.js';
import { register, login, refresh, logout, me } from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', verifyToken, me);

export default router;
