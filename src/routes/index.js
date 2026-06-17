import { Router } from 'express';
import auth from './auth.routes.js';
import listings from './listings.routes.js';

const router = Router();

router.use('/auth', auth);
router.use('/listings', listings);

export default router;
