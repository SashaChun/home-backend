import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { verifyToken } from './verifyToken.js';

function makeReq(authHeader) {
  return { headers: authHeader ? { authorization: authHeader } : {} };
}

describe('verifyToken', () => {
  it('attaches req.user for a valid Bearer token', () => {
    const token = jwt.sign({ sub: 'user-1', email: 'a@b.com' }, process.env.ACCESS_TOKEN_SECRET);
    const req = makeReq(`Bearer ${token}`);
    const next = vi.fn();

    verifyToken(req, {}, next);

    expect(next).toHaveBeenCalledWith(); // no error
    expect(req.user).toEqual({ id: 'user-1', email: 'a@b.com' });
  });

  it('rejects a missing Authorization header', () => {
    const next = vi.fn();
    verifyToken(makeReq(), {}, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, code: 'UNAUTHENTICATED' }),
    );
  });

  it('rejects a header that is not a Bearer token', () => {
    const next = vi.fn();
    verifyToken(makeReq('Basic abc'), {}, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, code: 'UNAUTHENTICATED' }),
    );
  });

  it('rejects a token signed with the wrong secret', () => {
    const token = jwt.sign({ sub: 'user-1' }, 'wrong_secret');
    const next = vi.fn();
    verifyToken(makeReq(`Bearer ${token}`), {}, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, code: 'INVALID_TOKEN' }),
    );
  });

  it('rejects an expired token', () => {
    const token = jwt.sign({ sub: 'user-1' }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: -10 });
    const next = vi.fn();
    verifyToken(makeReq(`Bearer ${token}`), {}, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, code: 'INVALID_TOKEN' }),
    );
  });
});
