'use client';

import React, { useState, useEffect } from 'react';
import { KeyRound } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/**
 * Change *your own* password.
 *
 * Distinct from the admin reset in `ResetPasswordModal`: no ADMIN permission
 * is involved, and the current password must be supplied — knowing it is what
 * authorises the change. Goes through `AuthContext.changePassword`, which hits
 * `/auth/change-password`.
 */
export function ChangePasswordModal({ isOpen, onClose, onChange }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm({ current: '', next: '', confirm: '' });
      setError('');
      setSubmitting(false);
    }
  }, [isOpen]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (!form.current) return setError('Enter your current password');
    if (form.next.length < 8) return setError('New password must be at least 8 characters');
    if (form.next !== form.confirm) return setError('New passwords do not match');
    if (form.next === form.current) return setError('The new password must be different');

    setSubmitting(true);
    const res = await onChange(form.current, form.next);
    setSubmitting(false);

    if (res.success) onClose();
    else setError(res.error || 'Could not change the password.');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Change Password"
      description="Update the password for your own account."
      size="sm"
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Input
          label="Current Password"
          type="password"
          required
          autoComplete="current-password"
          value={form.current}
          onChange={(e) => handleChange('current', e.target.value)}
          placeholder="••••••••"
        />
        <Input
          label="New Password"
          type="password"
          required
          autoComplete="new-password"
          value={form.next}
          onChange={(e) => handleChange('next', e.target.value)}
          placeholder="At least 8 characters"
          helperText="Minimum 8 characters."
        />
        <Input
          label="Confirm New Password"
          type="password"
          required
          autoComplete="new-password"
          value={form.confirm}
          onChange={(e) => handleChange('confirm', e.target.value)}
          placeholder="Repeat the new password"
        />

        {error && (
          <p className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting} icon={KeyRound}>
            Update Password
          </Button>
        </div>
      </form>
    </Modal>
  );
}
