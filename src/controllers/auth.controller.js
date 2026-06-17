import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { query, withTransaction } from '../services/db.js';

function rowToUser(row) {
  return {
    id: row.id,
    uid: row.id,
    email: row.email,
    displayName: row.display_name,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}

async function issueTokens(userId, email, res, client) {
  const q = client ? (t, p) => client.query(t, p) : query;
  const accessToken = jwt.sign(
    { sub: userId, email },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: '1h' },
  );
  const refreshToken = jwt.sign(
    { sub: userId },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: '7d' },
  );
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await q(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt],
  );
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
  });
  return accessToken;
}

export async function register(req, res, next) {
  try {
    const { email, password, displayName } = req.body;
    const exists = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length) {
      return next({ status: 409, code: 'EMAIL_IN_USE', message: 'Користувач з таким email вже існує' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING *',
      [email, passwordHash, displayName],
    );
    const accessToken = await issueTokens(rows[0].id, rows[0].email, res);
    res.status(201).json({ accessToken, data: rowToUser(rows[0]) });
  } catch (e) {
    next(e);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return next({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Невірний email або пароль' });
    }
    const accessToken = await issueTokens(rows[0].id, rows[0].email, res);
    res.json({ accessToken, data: rowToUser(rows[0]) });
  } catch (e) {
    next(e);
  }
}

export async function refresh(req, res, next) {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return next({ status: 401, code: 'UNAUTHENTICATED', message: 'No refresh token' });
    }
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch {
      return next({ status: 401, code: 'INVALID_TOKEN', message: 'Invalid refresh token' });
    }
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const { rows: tokenRows } = await query(
      'SELECT id FROM refresh_tokens WHERE token_hash = $1 AND expires_at > NOW()',
      [tokenHash],
    );
    if (!tokenRows.length) {
      return next({ status: 401, code: 'INVALID_TOKEN', message: 'Token revoked or expired' });
    }
    const { rows: userRows } = await query('SELECT * FROM users WHERE id = $1', [decoded.sub]);
    if (!userRows.length) {
      return next({ status: 401, code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    const accessToken = await withTransaction(async (client) => {
      await client.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
      return issueTokens(userRows[0].id, userRows[0].email, res, client);
    });
    res.json({ accessToken });
  } catch (e) {
    next(e);
  }
}

export async function logout(req, res, next) {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    }
    res.clearCookie('refreshToken', {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });
    res.json({ data: { ok: true } });
  } catch (e) {
    next(e);
  }
}

export async function me(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) {
      return next({ status: 404, code: 'NOT_FOUND', message: 'User not found' });
    }
    res.json({ data: rowToUser(rows[0]) });
  } catch (e) {
    next(e);
  }
}
