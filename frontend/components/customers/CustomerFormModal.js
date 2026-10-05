'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { FormModal } from '@/components/ui/FormModal';
import { Button } from '@/components/ui/Button';

const EMPTY_FORM = {
  name: '',
  company: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  gstin: '',
  status: 'active',
  outstandingBalance: 0,
};

export function CustomerFormModal({ isOpen, onClose, onSubmit, initialData }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      setForm(initialData ? { ...EMPTY_FORM, ...initialData } : EMPTY_FORM);
      setErrors({});
    }
  }, [isOpen, initialData]);

  const isEditing = !!initialData;

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.name.trim()) {
      nextErrors.name = 'Customer name is required';
    }
    if (!form.company.trim()) {
      nextErrors.company = 'Company / business name is required';
    }
    if (!form.email.trim()) {
      nextErrors.email = 'Email address is required';
    } else if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      nextErrors.email = 'Enter a valid email address';
    }
    if (!form.phone.trim()) {
      nextErrors.phone = 'Phone number is required';
    } else if (!/^[0-9+\-\s()]{10,}$/.test(form.phone.trim())) {
      nextErrors.phone = 'Enter a valid phone number';
    }
    if (!form.city.trim()) {
      nextErrors.city = 'City is required';
    }
    if (form.pincode && !/^\d{6}$/.test(form.pincode.trim())) {
      nextErrors.pincode = 'PIN code must be 6 digits';
    }
    if (form.gstin && !/^[0-9A-Za-z]{15}$/.test(form.gstin.trim())) {
      nextErrors.gstin = 'GSTIN must be exactly 15 alphanumeric characters';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    await onSubmit({
      ...form,
      name: form.name.trim(),
      company: form.company.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      pincode: form.pincode.trim(),
      gstin: form.gstin.trim(),
      outstandingBalance: Number(form.outstandingBalance || 0),
    });
  };

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={handleSubmit}
      title={isEditing ? 'Edit Customer' : 'Add New Customer'}
      description={
        isEditing
          ? 'Update the customer profile and billing details.'
          : 'Create a new customer profile with GST and billing information.'
      }
      submitLabel={isEditing ? 'Update Customer' : 'Add Customer'}
      size="lg"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Customer Name"
          required
          value={form.name}
          error={errors.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="e.g. Rajesh Sharma"
        />
        <Input
          label="Company / Business Name"
          required
          value={form.company}
          error={errors.company}
          onChange={(e) => handleChange('company', e.target.value)}
          placeholder="e.g. Apex Retail Mart Pvt Ltd"
        />

        <Input
          label="Email Address"
          type="email"
          required
          value={form.email}
          error={errors.email}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="name@company.com"
        />
        <Input
          label="Phone Number"
          required
          value={form.phone}
          error={errors.phone}
          onChange={(e) => handleChange('phone', e.target.value)}
          placeholder="+91 98200 12345"
        />

        <div className="sm:col-span-2">
          <Input
            label="Street Address"
            value={form.address}
            onChange={(e) => handleChange('address', e.target.value)}
            placeholder="Shop / Office address, street, landmark"
          />
        </div>

        <Input
          label="City"
          required
          value={form.city}
          error={errors.city}
          onChange={(e) => handleChange('city', e.target.value)}
          placeholder="e.g. Mumbai"
        />
        <Input
          label="State"
          value={form.state}
          onChange={(e) => handleChange('state', e.target.value)}
          placeholder="e.g. Maharashtra"
        />

        <Input
          label="PIN Code"
          value={form.pincode}
          error={errors.pincode}
          onChange={(e) => handleChange('pincode', e.target.value)}
          placeholder="400051"
          maxLength={6}
        />
        <Input
          label="GSTIN"
          value={form.gstin}
          error={errors.gstin}
          onChange={(e) => handleChange('gstin', e.target.value.toUpperCase())}
          placeholder="27AABCF1234F1Z8"
          maxLength={15}
          helperText="Optional – required for B2B tax invoicing"
        />

        <Select
          label="Account Status"
          value={form.status}
          onChange={(e) => handleChange('status', e.target.value)}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          placeholder="Select status"
        />
        <Input
          label="Opening Outstanding Balance (₹)"
          type="number"
          min="0"
          value={form.outstandingBalance}
          onChange={(e) => handleChange('outstandingBalance', e.target.value)}
          placeholder="0"
        />
      </div>
    </FormModal>
  );
}