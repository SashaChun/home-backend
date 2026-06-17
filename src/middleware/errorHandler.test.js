import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { errorHandler } from './errorHandler.js';

function makeRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('errorHandler', () => {
  let errSpy;
  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errSpy.mockRestore());

  it('uses the error status, code and message', () => {
    const res = makeRes();
    errorHandler({ status: 403, code: 'FORBIDDEN', message: 'nope' }, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'FORBIDDEN', message: 'nope' } });
  });

  it('defaults to 500 / INTERNAL for a bare error', () => {
    const res = makeRes();
    errorHandler(new Error('boom'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'INTERNAL', message: 'boom' } });
  });

  it('maps multer LIMIT_* codes to a 400', () => {
    const res = makeRes();
    errorHandler({ code: 'LIMIT_FILE_SIZE', message: 'too big' }, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'LIMIT_FILE_SIZE', message: 'too big' } });
  });

  it('logs 5xx errors to console.error but not 4xx', () => {
    const res = makeRes();
    errorHandler({ status: 404, code: 'NOT_FOUND', message: 'x' }, {}, res, () => {});
    expect(errSpy).not.toHaveBeenCalled();

    errorHandler({ status: 500, message: 'x' }, {}, res, () => {});
    expect(errSpy).toHaveBeenCalled();
  });
});
