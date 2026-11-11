import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  setupSchema,
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  userListQuerySchema,
  changePasswordSchema,
} from '../src/schemas/validators.js';

/** Field-keyed issues, shaped the way `middleware/validate.js` reports them. */
function issues(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) return {};
  const out = {};
  for (const issue of result.error.issues) {
    const field = issue.path.join('.') || '_';
    if (!out[field]) out[field] = issue.message;
  }
  return out;
}

describe('setupSchema (first run)', () => {
  const valid = { name: 'Ada Admin', email: 'Ada@Example.com', password: 'initialPass1' };

  test('accepts a minimal setup payload and normalises the email', () => {
    const parsed = setupSchema.parse(valid);
    assert.equal(parsed.email, 'ada@example.com');
    assert.equal(parsed.name, 'Ada Admin');
    assert.equal(parsed.company, undefined);
  });

  test('requires name, email and password', () => {
    assert.ok(issues(setupSchema, {}).name);
    assert.ok(issues(setupSchema, { name: 'X' }).email);
    assert.ok(issues(setupSchema, { name: 'X', email: 'a@b.co' }).password);
  });

  test('password follows the 8-character floor', () => {
    assert.equal(issues(setupSchema, { ...valid, password: 'short1' }).password,
      'Password must be at least 8 characters');
    assert.deepEqual(issues(setupSchema, { ...valid, password: 'password' }), {});
  });

  test('rejects a malformed email', () => {
    assert.ok(issues(setupSchema, { ...valid, email: 'not-an-email' }).email);
  });

  test('optional company block is validated when present', () => {
    const withCompany = {
      ...valid,
      company: {
        name: 'Acme Traders',
        state: 'Maharashtra',
        gstin: '27AABCF1234F1Z8',
        pincode: '400051',
      },
    };
    const parsed = setupSchema.parse(withCompany);
    assert.equal(parsed.company.name, 'Acme Traders');
    assert.equal(parsed.company.gstin, '27AABCF1234F1Z8'); // upper-cased by the schema

    // Nested issues are keyed by the joined path — `company.name`, not `company`.
    assert.ok(issues(setupSchema, { ...valid, company: { state: 'MH' } })['company.name']);
    assert.ok(issues(setupSchema, { ...valid, company: { name: 'Acme', gstin: 'TOOSHORT' } })['company.gstin']);
    assert.ok(issues(setupSchema, { ...valid, company: { name: 'Acme', pincode: '123' } })['company.pincode']);
  });
});

describe('createUserSchema', () => {
  const valid = { name: 'Cashier One', email: 'cashier@example.com', password: 'cashierPass1' };

  test('defaults to an active VIEWER', () => {
    const parsed = createUserSchema.parse(valid);
    assert.equal(parsed.role, 'VIEWER');
    assert.equal(parsed.isActive, true);
    // `.nullish()` yields `undefined` for an omitted key; the service layer
    // turns that into a real `NULL` on the way into the database.
    assert.equal(parsed.phone, undefined);
  });

  test('accepts every role in the enum', () => {
    for (const role of ['ADMIN', 'MANAGER', 'CASHIER', 'VIEWER']) {
      assert.equal(createUserSchema.parse({ ...valid, role }).role, role);
    }
  });

  test('rejects an unknown role', () => {
    assert.ok(issues(createUserSchema, { ...valid, role: 'SUPERADMIN' }).role);
  });

  test('enforces the password floor and normalises the email', () => {
    assert.ok(issues(createUserSchema, { ...valid, password: 'abc' }).password);
    assert.equal(createUserSchema.parse({ ...valid, email: 'A.B@EXAMPLE.COM' }).email, 'a.b@example.com');
  });

  test('requires a name', () => {
    assert.ok(issues(createUserSchema, { ...valid, name: '   ' }).name);
  });
});

describe('updateUserSchema', () => {
  test('accepts partial updates', () => {
    assert.deepEqual(updateUserSchema.parse({ name: 'New Name' }), { name: 'New Name' });
    assert.deepEqual(updateUserSchema.parse({ role: 'MANAGER' }), { role: 'MANAGER' });
    assert.equal(updateUserSchema.parse({ isActive: false }).isActive, false);
  });

  test('refuses an empty update', () => {
    assert.ok(issues(updateUserSchema, {})._);
  });

  test('email is not updatable through this schema (stripped, never errors)', () => {
    // Zod strips unknown keys, so a client sending email cannot change the
    // sign-in identifier — and does not get a confusing validation error either.
    const parsed = updateUserSchema.parse({ name: 'X', email: 'sneaky@example.com' });
    assert.equal('email' in parsed, false);
  });

  test('rejects an invalid role; coerces the active flag like every other schema', () => {
    assert.ok(issues(updateUserSchema, { role: 'ROOT' }).role);
    // `z.coerce.boolean()` is the repo-wide convention for `isActive`, and it
    // reads truthiness rather than type: any non-empty string becomes `true`.
    // The frontend and the smoke test both send real JSON booleans, so this is
    // lenience, not a hole — but it is not a type check, and this asserts the
    // real behaviour so a future switch to `z.boolean()` shows up as a diff.
    assert.equal(updateUserSchema.parse({ isActive: 'perhaps' }).isActive, true);
    assert.equal(updateUserSchema.parse({ isActive: false }).isActive, false);
  });
});

describe('resetPasswordSchema', () => {
  test('an empty body is valid: the server generates the password', () => {
    assert.deepEqual(resetPasswordSchema.parse({}), {});
  });

  test('a provided password still obeys the floor', () => {
    assert.equal(resetPasswordSchema.parse({ newPassword: 'eightch1' }).newPassword, 'eightch1');
    assert.ok(issues(resetPasswordSchema, { newPassword: 'short' }).newPassword);
  });
});

describe('userListQuerySchema', () => {
  test('sort defaults to name; paging coerces to integers', () => {
    const parsed = userListQuerySchema.parse({ page: '2', limit: '25' });
    assert.equal(parsed.sort, 'name');
    assert.equal(parsed.order, 'asc');
    assert.equal(parsed.page, 2);
    assert.equal(parsed.limit, 25);
  });

  test('rejects an unknown sort, order, role or status', () => {
    assert.ok(issues(userListQuerySchema, { sort: 'password' }).sort);
    assert.ok(issues(userListQuerySchema, { order: 'sideways' }).order);
    assert.ok(issues(userListQuerySchema, { role: 'BOSS' }).role);
    assert.ok(issues(userListQuerySchema, { status: 'archived' }).status);
  });

  test('page 0 is rejected (pages are 1-based)', () => {
    assert.ok(issues(userListQuerySchema, { page: '0' }).page);
  });
});

describe('changePasswordSchema', () => {
  test('requires both current and new, with the 8-character floor on the new one', () => {
    assert.ok(issues(changePasswordSchema, {}).currentPassword);
    assert.ok(issues(changePasswordSchema, { currentPassword: 'x' }).newPassword);
    assert.deepEqual(
      issues(changePasswordSchema, { currentPassword: 'x', newPassword: 'longenough' }),
      {}
    );
  });
});
