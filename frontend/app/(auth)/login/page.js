'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Lock, Mail, ArrowRight, ShieldCheck, User, Building2, Sparkles, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const HIGHLIGHTS = [
  { icon: Sparkles, title: 'Real-time Billing', text: 'POS-ready checkout with GST-compliant tax invoices' },
  { icon: Building2, title: 'Inventory Control', text: 'SKU-level stock tracking with low-stock alerts' },
  { icon: User, title: 'Customer Ledger', text: 'Outstanding balances and complete purchase history' },
];

export default function LoginPage() {
  const { login, demoCredentials } = useAuth();
  const { success, error } = useToast();
  const router = useRouter();

  const [email, setEmail] = useState(demoCredentials.email);
  const [password, setPassword] = useState(demoCredentials.password);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  /*
    Set when the header's "reset demo data" action ends the session on purpose
    (the seed recreates every user account). A toast cannot carry this over
    because it lives in the dashboard layout, which unmounts on redirect — so
    the reason has to arrive in the URL and be rendered here instead.

    Read in an effect, not during render: `/login` is statically prerendered, so
    `window` does not exist on the server, and reading it in the initialiser
    would both throw during the build and mismatch the server's markup.
  */
  const [resetNotice, setResetNotice] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('reset') === '1') {
      setResetNotice(true);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setFormError('');
    setLoading(true);

    // A real round-trip: the BFF route handler exchanges these credentials for
    // an httpOnly session cookie and returns the user profile.
    const res = await login(email, password);
    setLoading(false);

    if (res.success) {
      success('Welcome back to FlowPilot');
      // Honour ?next=… so the proxy's redirect survives a failed deep link.
      const next = new URLSearchParams(window.location.search).get('next');
      router.push(next && next.startsWith('/') ? next : '/dashboard');
    } else {
      setFormError(res.error);
      error(res.error);
    }
  };

  const fillDemo = () => {
    setEmail(demoCredentials.email);
    setPassword(demoCredentials.password);
    setFormError('');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center py-10 sm:px-6 lg:px-8">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#312e81_1px,transparent_1px)] [background-size:24px_24px] opacity-20 pointer-events-none" />

      <div className="relative z-10 w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        {/* Marketing panel */}
        <div className="hidden lg:block">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/40">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <p className="text-white font-bold text-xl tracking-tight leading-tight">FlowPilot</p>
              <p className="text-[11px] text-indigo-400 font-semibold tracking-wider uppercase">
                Sales &amp; Inventory
              </p>
            </div>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-white leading-tight">
            Run your entire
            <br />
            sales operation
            <br />
            <span className="text-indigo-400">from one workspace.</span>
          </h1>

          <p className="mt-4 text-sm text-slate-400 leading-relaxed max-w-md">
            Billing, stock, invoicing and analytics built for Indian retail and distribution
            businesses. Everything you need, nothing you don&apos;t.
          </p>

          <div className="mt-8 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-slate-800 border border-slate-700 shrink-0">
                  <item.icon className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Login card */}
        <div className="w-full max-w-md mx-auto lg:mx-0">
          {/* Mobile brand */}
          <div className="lg:hidden flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white mb-3 shadow-lg shadow-indigo-600/40">
              <Layers className="w-7 h-7" />
            </div>
            <p className="text-white font-bold text-lg">FlowPilot</p>
            <p className="text-[11px] text-indigo-400 font-semibold tracking-wider uppercase">
              Sales &amp; Inventory
            </p>
          </div>

          <div className="bg-white py-8 px-6 sm:px-8 shadow-2xl rounded-2xl border border-slate-100">
            {resetNotice && (
              <div className="mb-5 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5">
                <RefreshCw className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <p className="text-xs text-emerald-800 leading-relaxed">
                  <span className="font-semibold">Sample data restored.</span> The reset also
                  recreates every user account, so your previous session was closed. Sign in
                  again to continue.
                </p>
              </div>
            )}

            <h2 className="text-xl font-bold tracking-tight text-slate-900">Sign in</h2>
            <p className="text-sm text-slate-500 mt-1">
              Welcome back. Enter your credentials to continue.
            </p>

            <form className="space-y-4 mt-6" onSubmit={handleSubmit}>
              <Input
                label="Email address"
                type="email"
                icon={Mail}
                required
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFormError('');
                }}
                placeholder="admin@flowpilot.in"
              />

              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  icon={Lock}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFormError('');
                  }}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute top-[30px] right-3 text-slate-400 hover:text-slate-600 transition"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.879 7.879L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>

              {formError && (
                <p className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700">
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-between">
                <label htmlFor="remember" className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    id="remember"
                    type="checkbox"
                    defaultChecked
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Keep me signed in
                </label>
                <span className="text-xs text-slate-400 font-medium cursor-default">
                  Demo environment
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                icon={ArrowRight}
                iconPosition="right"
                className="w-full text-sm font-semibold"
              >
                Sign in to Dashboard
              </Button>
            </form>

            {/* Demo credentials */}
            <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Demo credentials</span>
                </div>
                <button
                  type="button"
                  onClick={fillDemo}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-200"
                >
                  Auto-fill
                </button>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Email</span>
                  <code className="font-mono font-medium text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {demoCredentials.email}
                  </code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Password</span>
                  <code className="font-mono font-medium text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {demoCredentials.password}
                  </code>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            FlowPilot v2.4 • Built with Next.js App Router &amp; Tailwind CSS
          </p>
        </div>
      </div>
    </div>
  );
}