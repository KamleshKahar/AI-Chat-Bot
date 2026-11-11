import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Unit tests for the user-administration service.
 *
 * The service takes `db = prisma` (the repository convention), so every guard
 * runs here against an in-memory fake — no MySQL required. The env fallbacks
 * below must be set before the module graph is imported, hence the dynamic
 * import in `before()`: ESM static imports are hoisted above any statement.
 */
process.env.DATABASE_URL ??= 'mysql://test:test@127.0.0.1:3306/flowpilot_unit';
process.env.JWT_SECRET ??= 'unit-test-secret-0123456789abcdef';

let userService;
let jwt;

// ---------------------------------------------------------------------------
// In-memory stand-in for the Prisma client
// ---------------------------------------------------------------------------

function makeDb() {
  const users = [];
  const companies = [];
  const audits = [];
  let nextId = 1;

  const matches = (where = {}, u) => {
    if (where.role !== undefined && u.role !== where.role) return false;
    if (where.isActive !== undefined && Boolean(u.isActive) !== Boolean(where.isActive)) return false;
    if (Array.isArray(where.OR)) {
      const hit = where.OR.some((cond) =>
        Object.entries(cond).some(([field, criterion]) => {
          if (criterion && typeof criterion === 'object' && 'contains' in criterion) {
            return String(u[field] ?? '')
              .toLowerCase()
              .includes(String(criterion.contains).toLowerCase());
          }
          return u[field] === criterion;
        })
      );
      if (!hit) return false;
    }
    return true;
  };

  const sortRows = (rows, orderBy) => {
    if (!orderBy) return rows;
    const [[key, dir]] = Object.entries(orderBy);
    return [...rows].sort((a, b) => {
      const av = a[key] ?? '';
      const bv = b[key] ?? '';
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === 'desc' ? -cmp : cmp;
    });
  };

  return {
    users,
    companies,
    audits,
    user: {
      findUnique: async ({ where }) =>
        where.email !== undefined
          ? (users.find((u) => u.email === where.email) ?? null)
          : (users.find((u) => u.id === Number(where.id)) ?? null),
      findMany: async ({ where = {}, orderBy, skip = 0, take } = {}) => {
        const rows = sortRows(users.filter((u) => matches(where, u)), orderBy);
        return rows.slice(skip, take === undefined ? undefined : skip + take);
      },
      count: async ({ where = {} } = {}) => users.filter((u) => matches(where, u)).length,
      create: async ({ data }) => {
        const row = {
          id: nextId++,
          phone: null,
          isActive: true,
          lastLoginAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        users.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = users.find((u) => u.id === Number(where.id));
        if (!row) throw new Error(`User ${where.id} not found`);
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    },
    companyProfile: {
      findFirst: async () => companies[0] ?? null,
      create: async ({ data }) => {
        const row = { id: companies.length + 1, invoicePrefix: 'INV', ...data };
        companies.push(row);
        return row;
      },
    },
    auditLog: {
      create: async ({ data }) => {
        audits.push(data);
        return data;
      },
    },
    // MySQL advisory lock: pretend we acquired it.
    $queryRaw: async () => [{ locked: 1 }],
  };
}

/** Insert a fully-formed user row directly (bypasses the service). */
function seedUser(db, overrides = {}) {
  const id = db.users.length + 1;
  const row = {
    id,
    email: `user${id}@example.com`,
    passwordHash: '$2b$10$fakefakefakefakefakefakefakefakefakefakefakefakefakefa',
    name: `User ${id}`,
    role: 'VIEWER',
    phone: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    ...overrides,
  };
  db.users.push(row);
  return row;
}

before(async () => {
  ({ userService } = await import('../src/services/user.service.js'));
  jwt = (await import('jsonwebtoken')).default;
});

// ---------------------------------------------------------------------------

describe('setupStatus', () => {
  test('reports setup needed on an empty users table', async () => {
    const db = makeDb();
    assert.deepEqual(await userService.setupStatus(db), { needsSetup: true });
  });

  test('reports setup complete once any account exists', async () => {
    const db = makeDb();
    seedUser(db);
    assert.deepEqual(await userService.setupStatus(db), { needsSetup: false });
  });
});

describe('runSetup (first run)', () => {
  const payload = {
    name: 'First Admin',
    email: 'First@Example.com',
    password: 'initialPass1',
    company: { name: 'Acme Traders', state: 'Maharashtra', gstin: '27AABCF1234F1Z8' },
  };

  test('creates the initial ADMIN, signs them in, and records an audit row', async () => {
    const db = makeDb();
    const result = await userService.runSetup(payload, { ip: '127.0.0.1' }, db);

    assert.equal(result.user.role, 'ADMIN');
    assert.equal(result.user.email, 'first@example.com'); // normalised
    assert.equal(result.user.isActive, true);
    assert.ok(result.user.permissions.includes('user:read'), 'admin can read users');
    assert.ok(result.user.permissions.includes('user:write'), 'admin can write users');
    assert.equal(db.users.length, 1);
    assert.equal(db.users[0].passwordHash.includes('initialPass1'), false, 'password is hashed');

    // The token must be a real signed JWT carrying the new admin's identity.
    const payloadDecoded = jwt.verify(result.token, process.env.JWT_SECRET);
    assert.equal(payloadDecoded.role, 'ADMIN');
    assert.equal(payloadDecoded.sub, String(result.user.id));
    assert.equal(payloadDecoded.email, 'first@example.com');

    assert.equal(db.companies.length, 1, 'company letterhead created');
    assert.equal(db.companies[0].name, 'Acme Traders');
    assert.ok(db.audits.some((a) => a.action === 'SETUP'));
  });

  test('refuses once any account exists (409)', async () => {
    const db = makeDb();
    seedUser(db, { role: 'ADMIN' });
    await assert.rejects(
      userService.runSetup(payload, {}, db),
      (err) => err.status === 409 && /already/i.test(err.message)
    );
    assert.equal(db.users.length, 1, 'no second account was created');
  });

  test('a company block is optional', async () => {
    const db = makeDb();
    const { company, ...withoutCompany } = payload;
    const result = await userService.runSetup(withoutCompany, {}, db);
    assert.equal(result.user.role, 'ADMIN');
    assert.equal(db.companies.length, 0);
  });

  test('never overwrites an existing company letterhead', async () => {
    const db = makeDb();
    db.companies.push({ id: 1, name: 'Real Company Ltd', invoicePrefix: 'ACME' });
    await userService.runSetup(payload, {}, db);
    assert.equal(db.companies.length, 1);
    assert.equal(db.companies[0].name, 'Real Company Ltd', 'existing letterhead preserved');
  });

  test('releases the advisory lock even when setup is refused', async () => {
    const db = makeDb();
    seedUser(db, { role: 'ADMIN' });
    let released = 0;
    db.$queryRaw = async (strings) => {
      if (String(strings[0]).includes('RELEASE_LOCK')) released += 1;
      return [{ locked: 1 }];
    };
    await assert.rejects(userService.runSetup(payload, {}, db));
    assert.equal(released, 1, 'lock released on the refusal path');
  });
});

describe('create', () => {
  test('creates an active account with a hashed password and no hash in the output', async () => {
    const db = makeDb();
    const actor = seedUser(db, { role: 'ADMIN' });

    const out = await userService.create(
      { name: 'New Cashier', email: 'CASH@Example.com', password: 'cashierPass1', role: 'CASHIER' },
      actor,
      { ip: '10.0.0.1' },
      db
    );

    assert.equal(out.email, 'cash@example.com');
    assert.equal(out.role, 'CASHIER');
    assert.equal(out.isActive, true);
    assert.equal('passwordHash' in out, false, 'hash never serialised');
    assert.equal(typeof out.id, 'string');
    assert.ok(out.permissions.includes('sale:create'));
    assert.equal(db.users[1].passwordHash.startsWith('$2'), true);
    assert.ok(
      db.audits.some((a) => a.action === 'CREATE' && a.entityType === 'user' && a.ip === '10.0.0.1')
    );
  });

  test('defaults a new account to VIEWER', async () => {
    const db = makeDb();
    const actor = seedUser(db, { role: 'ADMIN' });
    const out = await userService.create(
      { name: 'Nobody', email: 'nobody@example.com', password: 'password123' },
      actor,
      {},
      db
    );
    assert.equal(out.role, 'VIEWER');
  });

  test('refuses a duplicate email with a field-keyed 409', async () => {
    const db = makeDb();
    const actor = seedUser(db, { role: 'ADMIN' });
    seedUser(db, { email: 'taken@example.com' });

    await assert.rejects(
      userService.create(
        { name: 'Impostor', email: 'TAKEN@example.com', password: 'password123' },
        actor,
        {},
        db
      ),
      (err) =>
        err.status === 409 &&
        err.details?.email === 'An account with this email already exists'
    );
    assert.equal(db.users.length, 2, 'no duplicate row written');
  });
});

describe('update guards', () => {
  test('an administrator cannot change their own role', async () => {
    const db = makeDb();
    const admin = seedUser(db, { role: 'ADMIN' });
    await assert.rejects(
      userService.update(admin.id, { role: 'VIEWER' }, admin, {}, db),
      (err) => err.status === 403 && /own role/i.test(err.message)
    );
    assert.equal(admin.role, 'ADMIN', 'role unchanged');
  });

  test('an administrator cannot deactivate their own account', async () => {
    const db = makeDb();
    const admin = seedUser(db, { role: 'ADMIN' });
    await assert.rejects(
      userService.update(admin.id, { isActive: false }, admin, {}, db),
      (err) => err.status === 403
    );
    assert.equal(admin.isActive, true, 'still active');
  });

  test('a name-only edit on the last admin succeeds (the losing-admin guard must not misfire)', async () => {
    // Regression: the guard originally read `!data.isActive`, which is true when
    // `isActive` is *absent* — blocking ordinary edits to the sole admin.
    const db = makeDb();
    const admin = seedUser(db, { role: 'ADMIN' });
    const out = await userService.update(admin.id, { name: 'Renamed Admin' }, admin, {}, db);
    assert.equal(out.name, 'Renamed Admin');
    assert.equal(out.role, 'ADMIN', 'role untouched');
    assert.equal(out.isActive, true, 'status untouched');
  });

  test('the last active administrator cannot be demoted, even by another account', async () => {
    const db = makeDb();
    const target = seedUser(db, { role: 'ADMIN' });
    const otherActor = seedUser(db, { role: 'MANAGER' }); // routes would 403 this;
    await assert.rejects(                                   // the service must not rely on that.
      userService.update(target.id, { role: 'VIEWER' }, otherActor, {}, db),
      (err) => err.status === 409 && /last active administrator/i.test(err.message)
    );
    assert.equal(target.role, 'ADMIN');
  });

  test('the last active administrator cannot be deactivated', async () => {
    const db = makeDb();
    const target = seedUser(db, { role: 'ADMIN' });
    const otherActor = seedUser(db, { role: 'MANAGER' });
    await assert.rejects(
      userService.update(target.id, { isActive: false }, otherActor, {}, db),
      (err) => err.status === 409
    );
    assert.equal(target.isActive, true);
  });

  test('a demotion goes through when another active admin remains', async () => {
    const db = makeDb();
    seedUser(db, { role: 'ADMIN' }); // the other, still-active admin
    const actor = seedUser(db, { role: 'ADMIN' }); // wait: two admins + target = 3
    const target = seedUser(db, { role: 'ADMIN' });
    const out = await userService.update(target.id, { role: 'MANAGER' }, actor, {}, db);
    assert.equal(out.role, 'MANAGER');
    assert.ok(db.audits.some((a) => a.action === 'UPDATE' && a.entityType === 'user'));
  });

  test('deactivating another user works', async () => {
    const db = makeDb();
    const admin = seedUser(db, { role: 'ADMIN' });
    const cashier = seedUser(db, { role: 'CASHIER' });
    const out = await userService.update(cashier.id, { isActive: false }, admin, {}, db);
    assert.equal(out.isActive, false);
  });

  test('an unknown id is a 404', async () => {
    const db = makeDb();
    const admin = seedUser(db, { role: 'ADMIN' });
    await assert.rejects(
      userService.update(999, { name: 'Ghost' }, admin, {}, db),
      (err) => err.status === 404
    );
  });
});

describe('resetPassword', () => {
  test('generates a temporary password, returns it once, and stores only the hash', async () => {
    const db = makeDb();
    const admin = seedUser(db, { role: 'ADMIN' });
    const target = seedUser(db, { role: 'CASHIER', email: 'reset@example.com' });

    const out = await userService.resetPassword(target.id, {}, admin, { ip: '1.2.3.4' }, db);

    assert.equal(out.generated, true);
    assert.equal(out.email, 'reset@example.com');
    assert.ok(out.tempPassword && out.tempPassword.length >= 8, 'usable temp password');
    assert.notEqual(target.passwordHash, out.tempPassword, 'never stored in plain text');

    // The returned password must actually open the account.
    const bcrypt = (await import('bcryptjs')).default;
    assert.equal(await bcrypt.compare(out.tempPassword, target.passwordHash), true);
    assert.ok(db.audits.some((a) => a.action === 'RESET_PASSWORD' && a.ip === '1.2.3.4'));
  });

  test('accepts an admin-supplied password and does not echo it back', async () => {
    const db = makeDb();
    const admin = seedUser(db, { role: 'ADMIN' });
    const target = seedUser(db);

    const out = await userService.resetPassword(
      target.id,
      { newPassword: 'chosenPass123' },
      admin,
      {},
      db
    );

    assert.equal(out.generated, false);
    assert.equal(out.tempPassword, null, 'the UI already knows this one');
    const bcrypt = (await import('bcryptjs')).default;
    assert.equal(await bcrypt.compare('chosenPass123', target.passwordHash), true);
  });

  test('an unknown id is a 404', async () => {
    const db = makeDb();
    const admin = seedUser(db, { role: 'ADMIN' });
    await assert.rejects(
      userService.resetPassword(999, {}, admin, {}, db),
      (err) => err.status === 404
    );
  });
});

describe('list', () => {
  test('filters by role, status and search, and never leaks the hash', async () => {
    const db = makeDb();
    seedUser(db, { name: 'Alpha Admin', email: 'alpha@example.com', role: 'ADMIN' });
    seedUser(db, { name: 'Beta Cashier', email: 'beta@example.com', role: 'CASHIER' });
    seedUser(db, { name: 'Gamma Viewer', email: 'gamma@example.com', role: 'VIEWER', isActive: false });

    const all = await userService.list({ sort: 'name', order: 'asc', skip: 0, take: 10 }, db);
    assert.equal(all.total, 3);
    assert.deepEqual(all.rows.map((r) => r.name), ['Alpha Admin', 'Beta Cashier', 'Gamma Viewer']);
    assert.equal('passwordHash' in all.rows[0], false);

    const cashiers = await userService.list({ role: 'CASHIER', skip: 0, take: 10 }, db);
    assert.equal(cashiers.total, 1);
    assert.equal(cashiers.rows[0].email, 'beta@example.com');

    const inactive = await userService.list({ status: 'inactive', skip: 0, take: 10 }, db);
    assert.equal(inactive.total, 1);
    assert.equal(inactive.rows[0].name, 'Gamma Viewer');

    const search = await userService.list({ search: 'BETA', skip: 0, take: 10 }, db);
    assert.equal(search.total, 1, 'search is case-insensitive');
    assert.equal(search.rows[0].email, 'beta@example.com');

    const byRole = await userService.list({ sort: 'role', order: 'asc', skip: 0, take: 10 }, db);
    assert.deepEqual(byRole.rows.map((r) => r.role), ['ADMIN', 'CASHIER', 'VIEWER']);
  });

  test('paginates with skip/take', async () => {
    const db = makeDb();
    for (let i = 1; i <= 5; i += 1) seedUser(db, { name: `User ${i}`, email: `u${i}@example.com` });
    const page2 = await userService.list({ sort: 'name', order: 'asc', skip: 2, take: 2 }, db);
    assert.equal(page2.total, 5);
    assert.deepEqual(page2.rows.map((r) => r.email), ['u3@example.com', 'u4@example.com']);
  });
});

describe('detail', () => {
  test('returns the serialised user or 404', async () => {
    const db = makeDb();
    const user = seedUser(db, { role: 'MANAGER' });
    const out = await userService.detail(user.id, db);
    assert.equal(out.role, 'MANAGER');
    assert.ok(out.permissions.length > 0);
    await assert.rejects(userService.detail(999, db), (err) => err.status === 404);
  });
});
