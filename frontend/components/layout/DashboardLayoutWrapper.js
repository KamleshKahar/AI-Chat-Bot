'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '@/context/AuthContext';
import { LoadingSpinner } from '@/components/ui/StateFeedback';

export function DashboardLayoutWrapper({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  // Optimistically bounce anonymous visitors; AuthContext owns the real
  // teardown (cookie clearing) and renders the expired-session panel below.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner text="Authenticating FlowPilot..." />
      </div>
    );
  }

  // Backstop only. `AuthContext` clears the cookie and hard-navigates on a 401,
  // so this branch should be unreachable in practice. It still must not render
  // `null`: a blank page with no way out is the worst possible failure, and this
  // is the last line that could produce one. A `router.push` alone is not
  // enough — an in-flight client transition can reconcile the URL back to the
  // protected page after the push — so this offers the user the link directly.
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full text-center">
          <h1 className="text-lg font-semibold text-slate-900">Your session has ended</h1>
          <p className="mt-2 text-sm text-slate-600">
            For your security you were signed out. This also happens after restoring the
            sample data, which recreates every user account.
          </p>
          <a
            href="/login"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Sign in again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Header onMenuClick={() => setSidebarOpen(true)} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
