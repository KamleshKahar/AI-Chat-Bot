import Link from 'next/link';
import { FileQuestion, ArrowLeft, LayoutDashboard } from 'lucide-react';

export const metadata = {
  title: 'Page Not Found | FlowPilot',
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="text-center max-w-md">
        <div className="w-14 h-14 rounded-xl bg-indigo-600 text-white flex items-center justify-center mx-auto mb-5">
          <FileQuestion className="w-7 h-7" />
        </div>

        <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-2">
          Error 404
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          The page you are looking for does not exist or has been moved. Use the dashboard to
          navigate to a valid module.
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition"
          >
            <LayoutDashboard className="w-4 h-4" />
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}