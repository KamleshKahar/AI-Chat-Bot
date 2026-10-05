'use client';

import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

export function FormModal({
  isOpen,
  onClose,
  onSubmit,
  title,
  description,
  submitLabel = 'Save Changes',
  children,
  size = 'lg',
  isSubmitting = false,
}) {
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (onSubmit) {
      await onSubmit();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} description={description} size={size}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {children}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}