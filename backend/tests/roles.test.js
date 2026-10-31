import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  permissionsFor,
  can,
  requirePermission,
} from '../src/middleware/roles.js';
import { AppError } from '../src/errors/AppError.js';

/**
 * The permission matrix is the contract for both the API routes and the
 * frontend's UI gating (`/auth/me` serialises `permissionsFor(role)`), so a
 * regression here is a silent security change.
 */

describe('permission matrix', () => {
  test('ADMIN holds every permission, including user administration', () => {
    for (const permission of Object.values(PERMISSIONS)) {
      assert.ok(can('ADMIN', permission), `ADMIN should have ${permission}`);
    }
    assert.ok(can('ADMIN', PERMISSIONS.USER_READ));
    assert.ok(can('ADMIN', PERMISSIONS.USER_WRITE));
  });

  test('user administration is ADMIN-only', () => {
    for (const role of ['MANAGER', 'CASHIER', 'VIEWER']) {
      assert.equal(can(role, PERMISSIONS.USER_READ), false, `${role} must not read users`);
      assert.equal(can(role, PERMISSIONS.USER_WRITE), false, `${role} must not write users`);
    }
  });

  test('reports are ADMIN/MANAGER only', () => {
    assert.ok(can('ADMIN', PERMISSIONS.REPORT_READ));
    assert.ok(can('MANAGER', PERMISSIONS.REPORT_READ));
    assert.equal(can('CASHIER', PERMISSIONS.REPORT_READ), false);
    assert.equal(can('VIEWER', PERMISSIONS.REPORT_READ), false);
  });

  test('every role can read the catalogue', () => {
    for (const role of ['ADMIN', 'MANAGER', 'CASHIER', 'VIEWER']) {
      assert.ok(can(role, PERMISSIONS.PRODUCT_READ), `${role} should read products`);
      assert.ok(can(role, PERMISSIONS.CUSTOMER_READ), `${role} should read customers`);
      assert.ok(can(role, PERMISSIONS.SALE_READ), `${role} should read sales`);
      assert.ok(can(role, PERMISSIONS.INVOICE_READ), `${role} should read invoices`);
      assert.ok(can(role, PERMISSIONS.DASHBOARD_READ), `${role} should read the dashboard`);
    }
  });

  test('VIEWER is read-only across the board', () => {
    for (const permission of Object.values(PERMISSIONS)) {
      if (permission.endsWith(':read')) continue;
      assert.equal(can('VIEWER', permission), false, `VIEWER must not have ${permission}`);
    }
  });

  test('CASHIER rings up sales but cannot pay invoices, report, or write the catalogue', () => {
    assert.ok(can('CASHIER', PERMISSIONS.SALE_CREATE));
    assert.ok(can('CASHIER', PERMISSIONS.PRODUCT_ADJUST_STOCK));
    assert.equal(can('CASHIER', PERMISSIONS.INVOICE_PAY), false);
    assert.equal(can('CASHIER', PERMISSIONS.PRODUCT_WRITE), false);
    assert.equal(can('CASHIER', PERMISSIONS.CUSTOMER_WRITE), false);
  });

  test('product deletion is ADMIN-only', () => {
    assert.ok(can('ADMIN', PERMISSIONS.PRODUCT_DELETE));
    for (const role of ['MANAGER', 'CASHIER', 'VIEWER']) {
      assert.equal(can(role, PERMISSIONS.PRODUCT_DELETE), false);
    }
  });

  test('the seed permission no longer exists (the seed endpoint was removed)', () => {
    assert.equal(PERMISSIONS.SEED_RESET, undefined);
    assert.equal('seed:reset' in ROLE_PERMISSIONS.ADMIN, false);
  });

  test('an unknown role gets nothing (deny by default)', () => {
    assert.deepEqual(permissionsFor('SUPERUSER'), []);
    assert.deepEqual(permissionsFor(undefined), []);
    assert.deepEqual(permissionsFor(null), []);
  });

  test('no non-admin role can see the report:read flag', () => {
    assert.equal(ROLE_PERMISSIONS.MANAGER.includes('report:read'), true);
    assert.equal(ROLE_PERMISSIONS.CASHIER.includes('report:read'), false);
    assert.equal(ROLE_PERMISSIONS.VIEWER.includes('report:read'), false);
  });
});

describe('requirePermission middleware', () => {
  function run(permissions, role) {
    const guard = requirePermission(...permissions);
    let outcome = null;
    guard({ user: role ? { role } : undefined }, {}, (err) => {
      outcome = err;
    });
    return outcome;
  }

  test('passes through when the role holds the permission', () => {
    assert.equal(run([PERMISSIONS.USER_WRITE], 'ADMIN'), undefined);
    assert.equal(run([PERMISSIONS.PRODUCT_READ], 'VIEWER'), undefined);
  });

  test('rejects with 403 naming the missing permissions', () => {
    const err = run([PERMISSIONS.USER_WRITE, PERMISSIONS.USER_READ], 'MANAGER');
    assert.ok(err instanceof AppError);
    assert.equal(err.status, 403);
    assert.equal(err.code, 'FORBIDDEN');
    assert.deepEqual(err.details.missing, ['user:write', 'user:read']);
    assert.ok(/MANAGER/.test(err.message));
  });

  test('rejects an unauthenticated request (no role at all)', () => {
    const err = run([PERMISSIONS.USER_READ], undefined);
    assert.ok(err instanceof AppError);
    assert.equal(err.status, 403);
  });

  test('requires ALL listed permissions, not just one', () => {
    assert.equal(run([PERMISSIONS.PRODUCT_READ, PERMISSIONS.PRODUCT_DELETE], 'MANAGER')?.status, 403);
    assert.equal(run([PERMISSIONS.PRODUCT_READ, PERMISSIONS.PRODUCT_DELETE], 'ADMIN'), undefined);
  });
});
