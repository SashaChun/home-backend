import { query } from '../services/db.js';

export const requireOwner = (table) => async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, owner_id FROM ${table} WHERE id = $1`,
      [req.params.id],
    );
    if (!rows.length) {
      return next({ status: 404, code: 'NOT_FOUND', message: 'Resource not found' });
    }
    if (rows[0].owner_id !== req.user.id) {
      return next({ status: 403, code: 'FORBIDDEN', message: 'Not the owner' });
    }
    req.resource = rows[0];
    next();
  } catch (e) {
    next(e);
  }
};
