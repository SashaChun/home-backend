const MULTER_CODES = new Set([
  'LIMIT_PART_COUNT', 'LIMIT_FILE_SIZE', 'LIMIT_FILE_COUNT',
  'LIMIT_FIELD_KEY', 'LIMIT_FIELD_VALUE', 'LIMIT_FIELD_COUNT',
  'LIMIT_UNEXPECTED_FILE',
]);

export function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let code = err.code || 'INTERNAL';
  let message = err.message || 'Internal error';

  if (MULTER_CODES.has(err.code)) {
    status = 400;
  }
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: { code, message } });
}
