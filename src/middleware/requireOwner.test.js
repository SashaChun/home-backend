import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../services/db.js', () => ({ query: (...args) => query(...args) }));

const { requireOwner } = await import('./requireOwner.js');

function makeReq(ownerId = 'owner-1', resourceId = 'res-1') {
  return { params: { id: resourceId }, user: { id: ownerId } };
}

describe('requireOwner', () => {
  beforeEach(() => query.mockReset());

  it('passes and sets req.resource when the user owns the resource', async () => {
    query.mockResolvedValue({ rows: [{ id: 'res-1', owner_id: 'owner-1' }] });
    const req = makeReq('owner-1');
    const next = vi.fn();

    await requireOwner('listings')(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.resource).toEqual({ id: 'res-1', owner_id: 'owner-1' });
  });

  it('returns 404 when the resource does not exist', async () => {
    query.mockResolvedValue({ rows: [] });
    const next = vi.fn();

    await requireOwner('listings')(makeReq(), {}, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, code: 'NOT_FOUND' }),
    );
  });

  it('returns 403 when the user is not the owner', async () => {
    query.mockResolvedValue({ rows: [{ id: 'res-1', owner_id: 'someone-else' }] });
    const next = vi.fn();

    await requireOwner('listings')(makeReq('owner-1'), {}, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' }),
    );
  });

  it('forwards unexpected db errors to next', async () => {
    const boom = new Error('db down');
    query.mockImplementationOnce(async () => { throw boom; });
    const next = vi.fn();

    await requireOwner('listings')(makeReq(), {}, next);

    expect(next).toHaveBeenCalledWith(boom);
  });
});
