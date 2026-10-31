'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { FormModal } from '@/components/ui/FormModal';

/**
 * Create / edit a user account.
 *
 * Email is shown read-only when editing: it is the sign-in identifier, and the
 * backend deliberately omits it from `updateUserSchema` — changing it is an
 * out-of-band operation, not an inline edit. Passwords are never edited here
 * either; that is what the reset-password action is for.
 *
 * The last-admin and self-change rules live on the server (409 / 403), and the
 * submit handler passes those messages straight through. This form only
 * pre-empts the obvious cases so the user is not sent a round-trip to learn
 * what they did wrong.
 */

const EMPTY_FORM = { name: '', email: '', password: '', role: 'VIEWER', phone: '', isActive: true };

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Administrator — full access, including users' },
  { value: 'MANAGER', label: 'Manager — catalogue, sales, payments, reports' },
  { value: 'CASHIER', label: 'Cashier — ring up sales, adjust stock' },
  { value: 'VIEWER', label: 'Viewer — read-only' },
];

export function UserFormModal({ isOpen, onClose, onSubmit, initialData, currentUser }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setServerError('');
    setSubmitting(false);
    setForm(
      initialData
        ? {
            name: initialData.name ?? '',
            email: initialData.email ?? '',
            // Never pre-fill a password: an empty field means "unchanged".
            password: '',
            role: initialData.role ?? 'VIEWER',
            phone: initialData.phone ?? '',
            isActive: initialData.isActive ?? true,
          }
        : EMPTY_FORM
    );
  }, [isOpen, initialData]);

  const isEditing = Boolean(initialData);
  // The signed-in administrator cannot change their own role or status; the
  // server rejects it with a 403 regardless, this just stops them trying.
  const isSelf = Boolean(
    isEditing && currentUser && String(initialData.id) === String(currentUser.id)
  );

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
    setServerError('');
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!isEditing) {
      if (!form.email.trim()) next.email = 'Email address is required';
      else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Enter a valid email address';
      if (form.password.length < 8) next.password = 'Password must be at least 8 characters';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    setServerError('');
    try {
      if (isEditing) {
        // Email and password are deliberately absent — see the note at the top.
        await onSubmit({
          name: form.name.trim(),
          role: form.role,
          phone: form.phone.trim() || null,
          isActive: Boolean(form.isActive),
        });
      } else {
        await onSubmit({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          phone: form.phone.trim() || null,
          isActive: Boolean(form.isActive),
        });
      }
    } catch (err) {
      // 422 details are field-keyed; anything else is a banner message.
      if (err?.isValidation && err.details) setErrors(err.details);
      else setServerError(err.message || 'Could not save the user.');
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={handleSubmit}
      title={isEditing ? 'Edit User' : 'Add User'}
      description={
        isEditing
          ? 'Update this account’s name, role and access status.'
          : 'Create an account for a member of your team.'
      }
      submitLabel={isEditing ? 'Save Changes' : 'Create User'}
      isSubmitting={submitting}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Full Name"
          required
          value={form.name}
          error={errors.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="e.g. Priya Sharma"
        />

        {isEditing ? (
          <Input
            label="Email (sign-in)"
            value={form.email}
            readOnly
            disabled
            helperText="The sign-in email cannot be changed here."
            onChange={() => {}}
          />
        ) : (
          <Input
            label="Email"
            type="email"
            required
            value={form.email}
            error={errors.email}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="e.g. priya@company.com"
          />
        )}

        {!isEditing && (
          <Input
            label="Temporary Password"
            type="text"
            required
            value={form.password}
            error={errors.password}
            onChange={(e) => handleChange('password', e.target.value)}
            placeholder="At least 8 characters"
            helperText="Share this with the user — they can change it after signing in."
          />
        )}

        <Input
          label="Phone"
          value={form.phone}
          error={errors.phone}
          onChange={(e) => handleChange('phone', e.target.value)}
          placeholder="e.g. +91 98765 43210"
        />

        <Select
          label="Role"
          required
          options={ROLE_OPTIONS}
          value={form.role}
          error={errors.role}
          disabled={isSelf}
          onChange={(e) => handleChange('role', e.target.value)}
          helperText={isSelf ? 'You cannot change your own role.' : undefined}
        />

        <Select
          label="Access Status"
          options={[
            { value: 'active', label: 'Active — can sign in' },
            { value: 'inactive', label: 'Deactivated — cannot sign in' },
          ]}
          value={form.isActive ? 'active' : 'inactive'}
          error={errors.isActive}
          disabled={isSelf}
          onChange={(e) => handleChange('isActive', e.target.value === 'active')}
          helperText={
            isSelf
              ? 'You cannot deactivate your own account.'
              : 'Deactivating keeps the history but blocks sign-in immediately.'
          }
        />
      </div>

      {serverError && (
        <p className="mt-4 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700">
          {serverError}
        </p>
      )}
    </FormModal>
  );
}
