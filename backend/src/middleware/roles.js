import { AppError } from '../errors/AppError.js';

/**
 * Role-based access control.
 *
 * Multi-user by design: accounts are created by an administrator from the
 * `/users` screen, every mutating route is permission gated, and the frontend
 * renders from the same matrix (the `permissions` array on `/auth/me` is
 * computed here), so the UI and the API can never disagree about what a role
 * may do.
 */

/** Every permission the API understands. */
export const PERMISSIONS = {
  COMPANY_READ: 'company:read',
  COMPANY_WRITE: 'company:write',

  USER_READ: 'user:read',
  USER_WRITE: 'user:write',

  CATEGORY_READ: 'category:read',
  CATEGORY_WRITE: 'category:write',
  CATEGORY_DELETE: 'category:delete',

  PRODUCT_READ: 'product:read',
  PRODUCT_WRITE: 'product:write',
  PRODUCT_DELETE: 'product:delete',
  PRODUCT_ADJUST_STOCK: 'product:adjust-stock',

  CUSTOMER_READ: 'customer:read',
  CUSTOMER_WRITE: 'customer:write',
  CUSTOMER_DELETE: 'customer:delete',

  SALE_READ: 'sale:read',
  SALE_CREATE: 'sale:create',

  INVOICE_READ: 'invoice:read',
  INVOICE_PAY: 'invoice:pay',

  REPORT_READ: 'report:read',
  LEDGER_READ: 'ledger:read',
  DASHBOARD_READ: 'dashboard:read',
};

const READ_ONLY = [
  PERMISSIONS.COMPANY_READ,
  PERMISSIONS.CATEGORY_READ,
  PERMISSIONS.PRODUCT_READ,
  PERMISSIONS.CUSTOMER_READ,
  PERMISSIONS.SALE_READ,
  PERMISSIONS.INVOICE_READ,
  PERMISSIONS.LEDGER_READ,
  PERMISSIONS.DASHBOARD_READ,
  // `report:read` is deliberately *not* in READ_ONLY: financial reporting is
  // restricted to ADMIN and MANAGER, so it has to be granted explicitly below.
  // Leaving it here would silently hand every viewer the P&L.
];

/**
 * Explicit permission matrix. Deny by default: a role not listed here gets
 * nothing, so adding a role to Prisma's enum cannot accidentally grant access.
 */
export const ROLE_PERMISSIONS = {
  ADMIN: Object.values(PERMISSIONS),

  MANAGER: [
    ...READ_ONLY,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.CATEGORY_WRITE,
    PERMISSIONS.PRODUCT_WRITE,
    // Note: product:delete stays ADMIN-only (destructive, breaks historical stock).
    PERMISSIONS.PRODUCT_ADJUST_STOCK,
    PERMISSIONS.CUSTOMER_WRITE,
    PERMISSIONS.SALE_CREATE,
    PERMISSIONS.INVOICE_PAY,
  ],

  // A cashier rings up sales and moves stock, but has no authority over money
  // already invoiced and no access to reporting.
  CASHIER: [
    ...READ_ONLY,
    PERMISSIONS.SALE_CREATE,
    PERMISSIONS.PRODUCT_ADJUST_STOCK,
  ],

  VIEWER: READ_ONLY,
};

export function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function can(role, permission) {
  return permissionsFor(role).includes(permission);
}

/** Route guard factory: require one or more permissions. */
export function requirePermission(...required) {
  return function permissionGuard(req, res, next) {
    const granted = permissionsFor(req.user?.role);
    const missing = required.filter((p) => !granted.includes(p));

    if (missing.length > 0) {
      return next(
        AppError.forbidden(`Role ${req.user?.role ?? 'unknown'} is not permitted to perform this action`, {
          // `AppError` only reads `code` and `details` from its options, so the
          // diagnostic has to ride in `details` — passing `{ required, missing }`
          // straight through would have it destructured into two unused locals.
          details: { required, missing },
        })
      );
    }
    return next();
  };
}

/** Shorthand for read-only endpoints, which most roles can reach. */
export const requireAnyRead = requirePermission(...READ_ONLY.slice(0, 1));