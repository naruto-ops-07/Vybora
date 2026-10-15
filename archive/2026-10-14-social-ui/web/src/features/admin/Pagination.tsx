import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted">
      <span>
        {total === 0
          ? 'No results'
          : `${page * pageSize + 1}–${Math.min(total, (page + 1) * pageSize)} of ${total}`}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => onChange(page - 1)}
          leftIcon={<ChevronLeft size={14} />}
        >
          Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page + 1 >= pages}
          onClick={() => onChange(page + 1)}
        >
          Next <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    open: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    reviewing: 'bg-accent-soft text-accent',
    actioned: 'bg-success/15 text-success',
    dismissed: 'bg-surface-muted text-muted',
    active: 'bg-success/15 text-success',
    suspended: 'bg-danger/15 text-danger',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${tone[status] ?? 'bg-surface-muted'}`}
    >
      {status}
    </span>
  );
}
