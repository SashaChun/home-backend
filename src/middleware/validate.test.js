import { describe, it, expect, vi } from 'vitest';
import Joi from 'joi';
import { validate } from './validate.js';

const schema = Joi.object({
  name: Joi.string().required(),
  age: Joi.number().integer().min(0),
});

describe('validate', () => {
  it('calls next() and replaces req[where] with the coerced value', () => {
    const req = { body: { name: 'Ann', age: '30', extra: 'drop me' } };
    const next = vi.fn();

    validate(schema)(req, {}, next);

    expect(next).toHaveBeenCalledWith(); // no error
    expect(req.body).toEqual({ name: 'Ann', age: 30 }); // coerced + stripUnknown
  });

  it('forwards a 400 VALIDATION error when the payload is invalid', () => {
    const req = { body: { age: -5 } };
    const next = vi.fn();

    validate(schema)(req, {}, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, code: 'VALIDATION' }),
    );
  });

  it('validates the configured request location (e.g. query)', () => {
    const req = { query: { name: 'Bob' } };
    const next = vi.fn();

    validate(schema, 'query')(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.query).toEqual({ name: 'Bob' });
  });
});
