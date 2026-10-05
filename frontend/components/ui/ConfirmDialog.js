'use client';

import React from 'react';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Delete',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="flex items-start gap-4">
        <div
          className={`p-2.5 rounded-full shrink-0 ${
            variant === 'danger' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
          }`}
        >
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h4 className="text-base font-semibold text-slate-900">{title}</h4>
          <p className="mt-1.5 text-sm text-slate-600">{message}</p>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          {cancelText}
        </Button>
        <Button
          variant={variant}
          onClick={async () => {
            await onConfirm();
            onClose();
          }}
          loading={loading}
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}
