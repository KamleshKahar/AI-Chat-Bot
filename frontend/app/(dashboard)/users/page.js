'use client';

import React, { useState, useMemo } from 'react';
import { UserPlus, Users as UsersIcon, ShieldCheck, UserCheck, UserX, Pencil, KeyRound, Power } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useServerList, useDebouncedValue } from '@/hooks/useServerQuery';
import { formatNumber, formatDate } from '@/lib/formatters';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, StatCard } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { SearchInput, FilterChip } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/StateFeedback';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { UserFormModal } from '@/components/users/UserFormModal';
import { ResetPasswordModal } from '@/components/users/ResetPasswordModal';

const PER_PAGE = 10;

const ROLE_BADGES = {
  ADMIN: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  MANAGER: 'bg-sky-50 text-sky-700 border-sky-100',
  CASHIER: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  VIEWER: 'bg-slate-100 text-slate-600 border-slate-200',
};

/**
 * User administration (ADMIN only).
 *
 * Server-driven like every other list: this page owns query parameters and
 * renders whatever `GET /users` returns, so search, role/status filtering and
 * pagination all happen in SQL.
 *
 * Accounts are never deleted — only deactivated. Every sale, payment and audit
 * row references a real person, and a hard delete would either dangle those
 * references or silently rewrite history. Deactivation blocks sign-in
 * immediately while keeping the trail intact.
 *
 * The page is wrapped in `RequirePermission('user:read')`: the backend would
 * 403 every query anyway, but a clear "no access" panel beats a dashboard full
 * of error toasts for a stale bookmark.
 */
export default function UsersPage() {
  return (
    <RequirePermission permission="user:read">
      <UsersPageInner />
    </RequirePermission>
  );
}

function UsersPageInner() {
  const { user: me } = useAuth();
  const { createUser, updateUser, resetUserPassword, revision } = useData();
  const { success, error: errorToast } = useToast();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      role: roleFilter === 'all' ? undefined : roleFilter,
      status: statusFilter === 'all' ? undefined : statusFilter,
      sort: sortBy,
      order: sortBy === 'recent' || sortBy === 'last_login' ? 'desc' : 'asc',
      page,
      limit: PER_PAGE,
    }),
    [debouncedSearch, roleFilter, statusFilter, sortBy, page]
  );

  const { rows: users, meta, isLoading } = useServerList({
    path: '/users',
    query,
    refreshKey: revision,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);

  // The two rules the server will not bend, mirrored here so the UI does not
  // offer actions it will refuse: you cannot edit your own role or status.
  const isSelf = (row) => me && String(row.id) === String(me.id);

  const handleSave = async (data) => {
    // Errors deliberately propagate to the modal, which renders field-keyed
    // 422 details inline; only success reaches the toast.
    if (editingUser) {
      await updateUser(editingUser.id, data);
      success(`User "${data.name}" updated`);
    } else {
      await createUser(data);
      success(`User "${data.name}" created`);
    }
    setFormOpen(false);
    setEditingUser(null);
  };

  const handleResetPassword = async (id, newPassword) => {
    const data = await resetUserPassword(id, newPassword);
    if (!data.generated) success(`Password updated for ${data.email}`);
    return data;
  };

  const handleToggleStatus = async () => {
    if (!statusTarget) return;
    const next = !statusTarget.isActive;
    const name = statusTarget.name;
    try {
      await updateUser(statusTarget.id, { isActive: next });
      success(next ? `"${name}" reactivated` : `"${name}" deactivated — they can no longer sign in`);
    } catch (err) {
      // The last-admin guard answers 409 here; its message is worth showing.
      errorToast(err.message || 'Could not update the account.');
    } finally {
      setStatusTarget(null);
    }
  };

  const pageActive = users.filter((u) => u.isActive).length;
  const pageAdmins = users.filter((u) => u.role === 'ADMIN').length;

  const columns = [
    {
      key: 'name',
      header: 'User',
      accessor: 'name',
      render: (row) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center font-semibold text-xs shrink-0">
            {(row.name || '?')
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">
              {row.name}
              {isSelf(row) && (
                <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
                  You
                </span>
              )}
            </p>
            <p className="text-xs text-slate-500 truncate">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      accessor: 'role',
      render: (row) => (
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
            ROLE_BADGES[row.role] ?? ROLE_BADGES.VIEWER
          }`}
        >
          {row.role}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            row.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {row.isActive ? 'Active' : 'Deactivated'}
        </span>
      ),
    },
    {
      key: 'last_login',
      header: 'Last Sign-in',
      sortable: true,
      render: (row) => (
        <span className="text-sm text-slate-600">
          {row.lastLoginAt ? formatDate(row.lastLoginAt) : <span className="text-slate-400">Never</span>}
        </span>
      ),
    },
    {
      // Key is `recent` because DataTable passes the column key straight to the
      // backend's sort enum, which names createdAt-descending "recent".
      key: 'recent',
      header: 'Added',
      sortable: true,
      render: (row) => (
        <span className="text-sm text-slate-500">
          {row.createdAt ? formatDate(row.createdAt) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClass: 'text-right',
      cellClass: 'text-right',
      sortable: false,
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditingUser(row);
              setFormOpen(true);
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition"
            title="Edit user"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setResetTarget(row);
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-600 transition"
            title="Reset password"
          >
            <KeyRound className="w-4 h-4" />
          </button>
          {!isSelf(row) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setStatusTarget(row);
              }}
              className={`rounded-lg p-1.5 transition ${
                row.isActive
                  ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
                  : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'
              }`}
              title={row.isActive ? 'Deactivate user' : 'Reactivate user'}
            >
              <Power className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const clearFilters = () => {
    setSearch('');
    setRoleFilter('all');
    setStatusFilter('all');
    setPage(1);
  };

  const resetPageAndSet = (setter) => (value) => {
    setPage(1);
    setter(value);
  };

  const pickFilter = (setter) => (value) => () => {
    setPage(1);
    setter(value);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Create accounts, assign roles and control who can sign in."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Users' }]}
        actions={
          <Button
            variant="primary"
            icon={UserPlus}
            onClick={() => {
              setEditingUser(null);
              setFormOpen(true);
            }}
          >
            Add User
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Users (filtered)"
          value={formatNumber(meta.total ?? users.length)}
          icon={UsersIcon}
          tone="indigo"
        />
        <StatCard
          label="Active (this page)"
          value={formatNumber(pageActive)}
          icon={UserCheck}
          tone="emerald"
        />
        <StatCard
          label="Administrators (this page)"
          value={formatNumber(pageAdmins)}
          icon={ShieldCheck}
          tone="sky"
        />
        <StatCard
          label="Deactivated (this page)"
          value={formatNumber(users.length - pageActive)}
          icon={UserX}
          tone="amber"
        />
      </div>

      {/* Toolbar */}
      <Card padded={false} bodyClassName="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <SearchInput
            value={search}
            onChange={resetPageAndSet(setSearch)}
            placeholder="Search by name or email..."
          />

          <div className="flex flex-wrap items-center gap-2">
            {['all', 'ADMIN', 'MANAGER', 'CASHIER', 'VIEWER'].map((role) => (
              <FilterChip
                key={role}
                active={roleFilter === role}
                onClick={pickFilter(setRoleFilter)(role)}
              >
                {role === 'all' ? 'All roles' : role.charAt(0) + role.slice(1).toLowerCase()}
              </FilterChip>
            ))}

            <span className="w-px h-5 bg-slate-200 mx-1" aria-hidden="true" />

            <FilterChip
              active={statusFilter === 'active'}
              onClick={pickFilter(setStatusFilter)('active')}
            >
              Active
            </FilterChip>
            <FilterChip
              active={statusFilter === 'inactive'}
              onClick={pickFilter(setStatusFilter)('inactive')}
            >
              Deactivated
            </FilterChip>
            <FilterChip
              active={statusFilter === 'all'}
              onClick={pickFilter(setStatusFilter)('all')}
            >
              Any status
            </FilterChip>
          </div>
        </div>
      </Card>

      {/* Table */}
      <DataTable
        columns={columns}
        data={users}
        loading={isLoading}
        page={page}
        perPage={PER_PAGE}
        total={meta.total}
        onPageChange={setPage}
        sortKey={sortBy}
        sortOrder={sortBy === 'recent' || sortBy === 'last_login' ? 'desc' : 'asc'}
        onSortChange={(key) => {
          setPage(1);
          setSortBy(key);
        }}
        emptyState={
          <EmptyState
            icon={UsersIcon}
            title="No users found"
            description="No accounts match your current search or filter criteria."
            actionLabel="Clear filters"
            onAction={clearFilters}
          />
        }
      />

      {/* Modals */}
      <UserFormModal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingUser(null);
        }}
        onSubmit={handleSave}
        initialData={editingUser}
        currentUser={me}
      />

      <ResetPasswordModal
        isOpen={!!resetTarget}
        onClose={() => setResetTarget(null)}
        user={resetTarget}
        onReset={handleResetPassword}
      />

      <ConfirmDialog
        isOpen={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        onConfirm={handleToggleStatus}
        title={statusTarget?.isActive ? 'Deactivate user?' : 'Reactivate user?'}
        message={
          statusTarget?.isActive
            ? `"${statusTarget?.name}" will be signed out and blocked from signing in. Their history and records are kept.`
            : `"${statusTarget?.name}" will be able to sign in again with their existing password.`
        }
        confirmText={statusTarget?.isActive ? 'Deactivate' : 'Reactivate'}
      />
    </div>
  );
}
