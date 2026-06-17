import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema } from './auth.js';

describe('registerSchema', () => {
  const valid = { email: 'a@b.com', password: 'password1', displayName: 'Ivan' };

  it('accepts a valid payload', () => {
    const { error } = registerSchema.validate(valid);
    expect(error).toBeUndefined();
  });

  it('rejects an invalid email', () => {
    const { error } = registerSchema.validate({ ...valid, email: 'not-an-email' });
    expect(error).toBeDefined();
    expect(error.message).toMatch(/email/i);
  });

  it('rejects a password shorter than 8 chars', () => {
    const { error } = registerSchema.validate({ ...valid, password: 'short' });
    expect(error).toBeDefined();
    expect(error.message).toMatch(/password/i);
  });

  it('rejects a displayName shorter than 2 chars', () => {
    const { error } = registerSchema.validate({ ...valid, displayName: 'I' });
    expect(error).toBeDefined();
    expect(error.message).toMatch(/displayName/i);
  });

  it('requires all three fields', () => {
    const { error } = registerSchema.validate({ email: 'a@b.com' });
    expect(error).toBeDefined();
  });
});

describe('loginSchema', () => {
  it('accepts email + password', () => {
    const { error } = loginSchema.validate({ email: 'a@b.com', password: 'whatever' });
    expect(error).toBeUndefined();
  });

  it('does not enforce a password length (any non-empty password)', () => {
    const { error } = loginSchema.validate({ email: 'a@b.com', password: 'x' });
    expect(error).toBeUndefined();
  });

  it('rejects a missing password', () => {
    const { error } = loginSchema.validate({ email: 'a@b.com' });
    expect(error).toBeDefined();
  });
});
