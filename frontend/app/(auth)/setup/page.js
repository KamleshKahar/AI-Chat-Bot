'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Layers, ArrowRight, ArrowLeft, Building2, User, Check, ShieldCheck } from 'lucide-react';
import { apiPost } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/**
 * First-run setup wizard.
 *
 * Reachable only while the backend's `users` table is empty: `/login` redirects
 * here when `setup-status.needsSetup` is true, and `POST /auth/setup` answers
 * 409 the moment any account exists — so this page cannot be replayed to mint
 * extra administrators. Two steps: the administrator's own account, then the
 * company letterhead (optional; it can be filled in later under Settings).
 */

const EMPTY_ACCOUNT = { name: '', email: '', password: '', confirm: '' };
const EMPTY_COMPANY = {
  name: '',
  gstin: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
};

export default function SetupPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [account, setAccount] = useState(EMPTY_ACCOUNT);
  const [company, setCompany] = useState(EMPTY_COMPANY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  // Set when another visitor completed setup first (HTTP 409 from upstream).
  const [alreadyDone, setAlreadyDone] = useState(false);

  const setAccountField = (field, value) => {
    setAccount((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const setCompanyField = (field, value) => {
    setCompany((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  /** Step 1 validation — mirrors `setupSchema` on the backend, minus server-only rules. */
  function validateAccount() {
    const next = {};
    if (!account.name.trim()) next.name = 'Your name is required';
    if (!account.email.trim()) next.email = 'Email address is required';
    else if (!/^\S+@\S+\.\S+$/.test(account.email.trim())) next.email = 'Enter a valid email address';
    if (account.password.length < 8) next.password = 'Password must be at least 8 characters';
    if (account.confirm !== account.password) next.confirm = 'Passwords do not match';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  /** Step 2 validation — only the fields the user actually filled in. */
  function validateCompany() {
    const next = {};
    const hasAnyValue = Object.values(company).some((v) => v.trim());
    if (hasAnyValue && !company.name.trim()) next.name = 'Company name is required once any detail is entered';
    if (company.gstin && !/^[0-9A-Za-z]{15}$/.test(company.gstin.trim())) {
      next.gstin = 'GSTIN must be exactly 15 alphanumeric characters';
    }
    if (company.pincode && !/^\d{6}$/.test(company.pincode.trim())) {
      next.pincode = 'PIN code must be 6 digits';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const goToCompany = () => {
    setFormError('');
    if (!validateAccount()) return;
    setStep(2);
  };

  /**
   * Submit (or skip the optional step). `includeCompany` decides whether the
   * letterhead block rides along — an empty block is omitted entirely rather
   * than sent as a wall of empty strings, so the backend treats it exactly
   * like a skip.
   */
  const submit = async (includeCompany) => {
    if (loading) return;
    setFormError('');

    if (includeCompany && !validateCompany()) return;
    if (!includeCompany && step === 1 && !validateAccount()) return;

    setLoading(true);
    try {
      const body = {
        name: account.name.trim(),
        email: account.email.trim(),
        password: account.password,
        ...(includeCompany
          ? {
              company: {
                name: company.name.trim(),
                gstin: company.gstin.trim() || undefined,
                email: company.email.trim() || undefined,
                phone: company.phone.trim() || undefined,
                address: company.address.trim() || undefined,
                city: company.city.trim() || undefined,
                state: company.state.trim() || undefined,
                pincode: company.pincode.trim() || undefined,
              },
            }
          : {}),
      };

      // The BFF route sets the httpOnly session cookie; the token itself never
      // reaches this component.
      await apiPost('/auth/setup', body);

      // AuthContext re-runs `/auth/me` when the path leaves the public set, so
      // a client navigation is enough to arrive signed in.
      router.push('/dashboard');
    } catch (err) {
      if (err?.status === 409) {
        setAlreadyDone(true);
      } else if (err?.isValidation && err.details) {
        // 422 details are field-keyed and land on whichever step owns them.
        const accountFields = ['name', 'email', 'password'];
        const onStepOne = Object.keys(err.details).some((f) => accountFields.includes(f));
        if (onStepOne) setStep(1);
        setErrors(err.details);
      } else {
        setFormError(err.message || 'Setup failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center py-10 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(#312e81_1px,transparent_1px)] [background-size:24px_24px] opacity-20 pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg">
        {/* Brand */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white mb-3 shadow-lg shadow-indigo-600/40">
            <Layers className="w-7 h-7" />
          </div>
          <p className="text-white font-bold text-lg">FlowPilot</p>
          <p className="text-[11px] text-indigo-400 font-semibold tracking-wider uppercase">
            Welcome — let&apos;s get you set up
          </p>
        </div>

        <div className="bg-white py-8 px-6 sm:px-8 shadow-2xl rounded-2xl border border-slate-100">
          {alreadyDone ? (
            <>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                Setup already completed
              </h2>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                This installation already has an administrator account, so there is nothing left
                to create here. Head to the sign-in page to continue.
              </p>
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="w-full mt-6 text-sm font-semibold"
                onClick={() => router.push('/login')}
              >
                Go to sign in
              </Button>
            </>
          ) : (
            <>
              {/* Step indicator */}
              <div className="flex items-center gap-3 mb-6">
                <div
                  className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                    step === 1
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {step > 1 ? <Check className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                  Your account
                </div>
                <div className="h-px flex-1 bg-slate-200" />
                <div
                  className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                    step === 2
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  Company
                </div>
              </div>

              {step === 1 ? (
                <>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">
                    Create your administrator account
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    This first account owns the installation — you can invite the rest of your
                    team afterwards.
                  </p>

                  <div className="space-y-4 mt-6">
                    <Input
                      label="Your name"
                      required
                      autoComplete="name"
                      value={account.name}
                      error={errors.name}
                      onChange={(e) => setAccountField('name', e.target.value)}
                      placeholder="e.g. Kamlesh Patel"
                    />
                    <Input
                      label="Email address"
                      type="email"
                      required
                      autoComplete="email"
                      value={account.email}
                      error={errors.email}
                      onChange={(e) => setAccountField('email', e.target.value)}
                      placeholder="you@company.com"
                    />
                    <Input
                      label="Password"
                      type="password"
                      required
                      autoComplete="new-password"
                      value={account.password}
                      error={errors.password}
                      onChange={(e) => setAccountField('password', e.target.value)}
                      placeholder="At least 8 characters"
                      helperText="You will sign in with this. At least 8 characters."
                    />
                    <Input
                      label="Confirm password"
                      type="password"
                      required
                      autoComplete="new-password"
                      value={account.confirm}
                      error={errors.confirm}
                      onChange={(e) => setAccountField('confirm', e.target.value)}
                      placeholder="Repeat the password"
                    />
                  </div>

                  {formError && (
                    <p className="mt-4 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700">
                      {formError}
                    </p>
                  )}

                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    loading={loading}
                    icon={ArrowRight}
                    iconPosition="right"
                    className="w-full mt-6 text-sm font-semibold"
                    onClick={goToCompany}
                  >
                    Continue
                  </Button>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">
                    Your company letterhead
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Printed on every invoice. Fill in what you have — the rest can wait, and all
                    of it stays editable under Settings.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                    <div className="sm:col-span-2">
                      <Input
                        label="Company name"
                        required
                        value={company.name}
                        error={errors.name}
                        onChange={(e) => setCompanyField('name', e.target.value)}
                        placeholder="e.g. Apex Retail Mart Pvt Ltd"
                      />
                    </div>
                    <Input
                      label="GSTIN"
                      value={company.gstin}
                      error={errors.gstin}
                      onChange={(e) => setCompanyField('gstin', e.target.value.toUpperCase())}
                      placeholder="15-digit GSTIN"
                    />
                    <Input
                      label="Phone"
                      value={company.phone}
                      error={errors.phone}
                      onChange={(e) => setCompanyField('phone', e.target.value)}
                      placeholder="e.g. +91 98765 43210"
                    />
                    <div className="sm:col-span-2">
                      <Input
                        label="Email"
                        type="email"
                        value={company.email}
                        error={errors.email}
                        onChange={(e) => setCompanyField('email', e.target.value)}
                        placeholder="billing@company.com"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        label="Address"
                        value={company.address}
                        error={errors.address}
                        onChange={(e) => setCompanyField('address', e.target.value)}
                        placeholder="Street address"
                      />
                    </div>
                    <Input
                      label="City"
                      value={company.city}
                      error={errors.city}
                      onChange={(e) => setCompanyField('city', e.target.value)}
                      placeholder="e.g. Mumbai"
                    />
                    <Input
                      label="State"
                      value={company.state}
                      error={errors.state}
                      onChange={(e) => setCompanyField('state', e.target.value)}
                      placeholder="e.g. Maharashtra"
                    />
                    <Input
                      label="PIN code"
                      value={company.pincode}
                      error={errors.pincode}
                      onChange={(e) => setCompanyField('pincode', e.target.value)}
                      placeholder="6-digit PIN"
                    />
                  </div>

                  {formError && (
                    <p className="mt-4 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700">
                      {formError}
                    </p>
                  )}

                  <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 mt-6">
                    <Button
                      type="button"
                      variant="outline"
                      icon={ArrowLeft}
                      disabled={loading}
                      onClick={() => {
                        setFormError('');
                        setErrors({});
                        setStep(1);
                      }}
                    >
                      Back
                    </Button>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={loading}
                        onClick={() => submit(false)}
                      >
                        Skip for now
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        loading={loading}
                        icon={ArrowRight}
                        iconPosition="right"
                        className="text-sm font-semibold"
                        onClick={() => submit(true)}
                      >
                        Complete setup
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          Your password is stored as a bcrypt hash — never in plain text.
        </p>
        <p className="mt-2 text-center text-xs text-slate-600">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-indigo-400 hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
