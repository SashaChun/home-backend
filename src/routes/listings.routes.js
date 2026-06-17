import { Router } from 'express';
import multer from 'multer';
import { verifyToken } from '../middleware/verifyToken.js';
import { validate } from '../middleware/validate.js';
import { requireOwner } from '../middleware/requireOwner.js';
import {
  createListingSchema,
  updateListingSchema,
  listListingsQuerySchema,
  deletePhotoSchema,
} from '../validators/listings.js';
import {
  list,
  getOne,
  create,
  update,
  remove,
  uploadPhoto,
  deletePhoto,
} from '../controllers/listings.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image/* is allowed'));
    cb(null, true);
  },
});

const optionalAuth = async (req, res, next) => {
  if (!req.headers.authorization) return next();
  return verifyToken(req, res, next);
};

const router = Router();

router.get('/', validate(listListingsQuerySchema, 'query'), optionalAuth, list);
router.get('/:id', getOne);
router.post('/', verifyToken, validate(createListingSchema), create);
router.patch('/:id', verifyToken, requireOwner('listings'), validate(updateListingSchema), update);
router.delete('/:id', verifyToken, requireOwner('listings'), remove);

router.post('/:id/photos', verifyToken, requireOwner('listings'), upload.single('photo'), uploadPhoto);
router.delete('/:id/photos', verifyToken, requireOwner('listings'), validate(deletePhotoSchema), deletePhoto);

export default router;
