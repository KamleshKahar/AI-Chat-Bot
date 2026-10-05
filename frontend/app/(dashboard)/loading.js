import { LoadingSpinner } from '@/components/ui/StateFeedback';

export default function DashboardLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <LoadingSpinner text="Loading module..." />
    </div>
  );
}