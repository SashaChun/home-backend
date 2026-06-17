import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const query = vi.fn();
const withTransaction = vi.fn();
vi.mock('../services/db.js', () => ({
  query: (...a) => query(...a),
  withTransaction: (...a) => withTransaction(...a),
}));

const { register, login, refresh, logout, me } = await import('./auth.controller.js');

function makeRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.cookie = vi.fn(() => res);
  res.clearCookie = vi.fn(() => res);
  return res;
}

const userRow = {
  id: 'user-1',
  email: 'a@b.com',
  display_name: 'Ann',
  phone: null,
  avatar_url: null,
  created_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  query.mockReset();
  withTransaction.mockReset();
});

describe('register', () => {
  it('rejects a duplicate email with 409 EMAIL_IN_USE', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'existing' }] }); // SELECT finds a user
    const next = vi.fn();

    await register({ body: { email: 'a@b.com', password: 'password1', displayName: 'Ann' } }, makeRes(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 409, code: 'EMAIL_IN_USE' }),
    );
  });

  it('creates the user, issues tokens, sets the cookie and returns 201', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })          // SELECT — no existing user
      .mockResolvedValueOnce({ rows: [userRow] })   // INSERT users RETURNING *
      .mockResolvedValueOnce({ rows: [] });         // INSERT refresh_tokens
    const res = makeRes();
    const next = vi.fn();

    await register({ body: { email: 'a@b.com', password: 'password1', displayName: 'Ann' } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.accessToken).toBeTypeOf('string');
    expect(body.data).toMatchObject({ id: 'user-1', uid: 'user-1', email: 'a@b.com', displayName: 'Ann' });
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: 'strict' }));
    // password is hashed before insert
    const insertParams = query.mock.calls[1][1];
    expect(insertParams[1]).not.toBe('password1');
    expect(await bcrypt.compare('password1', insertParams[1])).toBe(true);
  });
});

describe('login', () => {
  it('rejects wrong credentials with 401 INVALID_CREDENTIALS', async () => {
    const hash = await bcrypt.hash('correct-password', 12);
    query.mockResolvedValueOnce({ rows: [{ ...userRow, password_hash: hash }] });
    const next = vi.fn();

    await login({ body: { email: 'a@b.com', password: 'wrong-password' } }, makeRes(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, code: 'INVALID_CREDENTIALS' }),
    );
  });

  it('rejects an unknown email with the same 401 (no user enumeration)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const next = vi.fn();

    await login({ body: { email: 'ghost@b.com', password: 'whatever' } }, makeRes(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, code: 'INVALID_CREDENTIALS' }),
    );
  });

  it('issues an access token on correct credentials', async () => {
    const hash = await bcrypt.hash('correct-password', 12);
    query
      .mockResolvedValueOnce({ rows: [{ ...userRow, password_hash: hash }] }) // SELECT user
      .mockResolvedValueOnce({ rows: [] });                                   // INSERT refresh_tokens
    const res = makeRes();
    const next = vi.fn();

    await login({ body: { email: 'a@b.com', password: 'correct-password' } }, res, next);

    expect(next).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    const decoded = jwt.verify(body.accessToken, process.env.ACCESS_TOKEN_SECRET);
    expect(decoded.sub).toBe('user-1');
    expect(body.data.email).toBe('a@b.com');
  });
});

describe('refresh', () => {
  it('rejects a request with no refresh cookie', async () => {
    const next = vi.fn();
    await refresh({ cookies: {} }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, code: 'UNAUTHENTICATED' }),
    );
  });

  it('rejects a structurally invalid refresh token', async () => {
    const next = vi.fn();
    await refresh({ cookies: { refreshToken: 'garbage' } }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, code: 'INVALID_TOKEN' }),
    );
  });

  it('rejects a valid token that is not present in the DB (revoked)', async () => {
    const token = jwt.sign({ sub: 'user-1' }, process.env.REFRESH_TOKEN_SECRET);
    query.mockResolvedValueOnce({ rows: [] }); // token hash not found
    const next = vi.fn();

    await refresh({ cookies: { refreshToken: token } }, makeRes(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, code: 'INVALID_TOKEN' }),
    );
  });

  it('rotates the token atomically and returns a fresh access token', async () => {
    const token = jwt.sign({ sub: 'user-1' }, process.env.REFRESH_TOKEN_SECRET);
    query
      .mockResolvedValueOnce({ rows: [{ id: 'rt-1' }] }) // token found
      .mockResolvedValueOnce({ rows: [userRow] });       // user found
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    withTransaction.mockImplementation(async (fn) => fn(client));
    const res = makeRes();
    const next = vi.fn();

    await refresh({ cookies: { refreshToken: token } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(withTransaction).toHaveBeenCalled();
    // old token deleted, new token inserted — both through the transaction client
    const sqls = client.query.mock.calls.map((c) => c[0]);
    expect(sqls.some((s) => /DELETE FROM refresh_tokens/.test(s))).toBe(true);
    expect(sqls.some((s) => /INSERT INTO refresh_tokens/.test(s))).toBe(true);
    expect(res.json.mock.calls[0][0].accessToken).toBeTypeOf('string');
  });
});

describe('logout', () => {
  it('deletes the stored token and clears the cookie', async () => {
    const token = jwt.sign({ sub: 'user-1' }, process.env.REFRESH_TOKEN_SECRET);
    query.mockResolvedValueOnce({ rows: [] });
    const res = makeRes();
    const next = vi.fn();

    await logout({ cookies: { refreshToken: token } }, res, next);

    expect(query).toHaveBeenCalledWith(
      'DELETE FROM refresh_tokens WHERE token_hash = $1',
      expect.any(Array),
    );
    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', expect.objectContaining({ httpOnly: true, sameSite: 'strict' }));
    expect(res.json).toHaveBeenCalledWith({ data: { ok: true } });
  });

  it('still clears the cookie when no token cookie is present', async () => {
    const res = makeRes();
    await logout({ cookies: {} }, res, vi.fn());
    expect(query).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
  });
});

describe('me', () => {
  it('returns the current user', async () => {
    query.mockResolvedValueOnce({ rows: [userRow] });
    const res = makeRes();
    await me({ user: { id: 'user-1' } }, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ data: expect.objectContaining({ id: 'user-1', uid: 'user-1' }) });
  });

  it('returns 404 when the user no longer exists', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const next = vi.fn();
    await me({ user: { id: 'gone' } }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });
});
