import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  hint?: string;
  className?: string;
}

/** Premium empty state — icon, message, optional CTA */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  hint,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`lms-empty flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}>
      <div className="lms-empty-icon mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 ring-1 ring-slate-200/80">
        <Icon className="h-9 w-9 text-slate-400" strokeWidth={1.5} />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-slate-500 leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
      {hint && <p className="mt-3 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
