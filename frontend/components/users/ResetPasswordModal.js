'use client';

import React, { useState, useEffect } from 'react';
import { KeyRound, Copy, Check, AlertTriangle, Shuffle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/**
 * Admin password reset.
 *
 * Two modes. The default asks the *server* to generate a temporary password —
 * it comes back in this response and is displayed exactly once, because only
 * the bcrypt hash was stored. The alternative sets a chosen password, in which
 * case nothing is echoed back (the administrator already knows it).
 */
export function ResetPasswordModal({ isOpen, onClose, user, onReset }) {
  const [mode, setMode] = useState('generate');
  const [chosen, setChosen] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // The one-time result: `{ generated, tempPassword }` from the server.
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode('generate');
      setChosen('');
      setConfirm('');
      setError('');
      setSubmitting(false);
      setResult(null);
      setCopied(false);
    }
  }, [isOpen, user?.id]);

  const handleReset = async () => {
    if (submitting) return;
    setError('');

    if (mode === 'choose') {
      if (chosen.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
      if (chosen !== confirm) {
        setError('Passwords do not match');
        return;
      }
    }

    setSubmitting(true);
    try {
      const data = await onReset(user.id, mode === 'choose' ? chosen : undefined);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Could not reset the password.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyTemp = async () => {
    if (!result?.tempPassword) return;
    try {
      await navigator.clipboard.writeText(result.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied — the value is selectable on screen anyway.
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reset Password"
      description={user ? `For ${user.name} (${user.email})` : undefined}
      size="sm"
    >
      {result ? (
        <div className="space-y-4">
          {result.generated ? (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 mb-3">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Shown once — copy it now</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-white border border-amber-200 px-3 py-2 font-mono text-sm font-semibold text-slate-900 select-all">
                    {result.tempPassword}
                  </code>
                  <button
                    type="button"
                    onClick={copyTemp}
                    className="rounded-lg border border-amber-300 bg-white p-2 text-amber-700 hover:bg-amber-100 transition"
                    title="Copy temporary password"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-3 text-xs text-amber-800 leading-relaxed">
                  The server stored only a hash of this password, so it cannot be shown again.
                  Send it to {user?.name ?? 'the user'} over a channel you trust, and ask them to
                  change it after signing in.
                </p>
              </div>

              <Button type="button" variant="primary" className="w-full" onClick={onClose}>
                I&apos;ve copied it — Done
              </Button>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs text-emerald-800">
                Password updated. {user?.name ?? 'The user'} can sign in with the new password
                right away.
              </div>
              <Button type="button" variant="primary" className="w-full" onClick={onClose}>
                Done
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('generate')}
              className={`flex-1 rounded-lg border px-3 py-2.5 text-xs font-semibold transition ${
                mode === 'generate'
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Shuffle className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              Generate temporary
            </button>
            <button
              type="button"
              onClick={() => setMode('choose')}
              className={`flex-1 rounded-lg border px-3 py-2.5 text-xs font-semibold transition ${
                mode === 'choose'
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              Set a password
            </button>
          </div>

          {mode === 'generate' ? (
            <p className="text-xs text-slate-500 leading-relaxed">
              FlowPilot will create a random temporary password and show it to you once. Only the
              hash is stored, so it cannot be retrieved later.
            </p>
          ) : (
            <div className="space-y-4">
              <Input
                label="New Password"
                type="text"
                required
                value={chosen}
                onChange={(e) => {
                  setChosen(e.target.value);
                  setError('');
                }}
                placeholder="At least 8 characters"
                helperText="Minimum 8 characters."
              />
              <Input
                label="Confirm New Password"
                type="text"
                required
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setError('');
                }}
                placeholder="Repeat the password"
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" variant="primary" loading={submitting} onClick={handleReset}>
              {mode === 'generate' ? 'Generate & Reset' : 'Set Password'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
