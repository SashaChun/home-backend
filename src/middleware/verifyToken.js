import jwt from 'jsonwebtoken';

export function verifyToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next({ status: 401, code: 'UNAUTHENTICATED', message: 'Missing token' });
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = { id: decoded.sub, email: decoded.email };
    next();
  } catch {
    next({ status: 401, code: 'INVALID_TOKEN', message: 'Invalid token' });
  }
}
