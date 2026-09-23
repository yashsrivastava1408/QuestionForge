import { describe, it, expect } from 'vitest';
import { loginSchema, registerSchema } from '../controllers/authController.js';

describe('Auth Zod Schema Validation', () => {
  describe('loginSchema', () => {
    it('accepts valid login payloads', () => {
      const valid = {
        email: 'admin@demo.com',
        password: 'password123',
        organizationSlug: 'demo',
      };
      expect(() => loginSchema.parse(valid)).not.toThrow();
    });

    it('rejects invalid emails', () => {
      const invalid = {
        email: 'not-an-email',
        password: 'password123',
        organizationSlug: 'demo',
      };
      expect(() => loginSchema.parse(invalid)).toThrow();
    });

    it('rejects passwords shorter than 8 characters', () => {
      const invalid = {
        email: 'admin@demo.com',
        password: 'short',
        organizationSlug: 'demo',
      };
      expect(() => loginSchema.parse(invalid)).toThrow();
    });
  });

  describe('registerSchema', () => {
    it('accepts valid registration with allowed roles', () => {
      const payload = {
        email: 'reviewer@demo.com',
        password: 'securepassword123',
        name: 'Reviewer Test',
        organizationSlug: 'demo',
        role: 'REVIEWER',
      };
      const parsed = registerSchema.parse(payload);
      expect(parsed.role).toBe('REVIEWER');
    });

    it('rejects unknown roles', () => {
      const payload = {
        email: 'reviewer@demo.com',
        password: 'securepassword123',
        name: 'Reviewer Test',
        organizationSlug: 'demo',
        role: 'SUPER_USER',
      };
      expect(() => registerSchema.parse(payload)).toThrow();
    });
  });
});
