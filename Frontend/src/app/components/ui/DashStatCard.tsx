import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router';

interface DashStatCardProps {
  label: string;
  hint: string;
  value: React.ReactNode;
  footer?: string;
  icon: LucideIcon;
  iconClass?: string;
  to?: string;
  accent?: 'purple' | 'blue' | 'orange' | 'cyan' | 'emerald';
  children?: React.ReactNode;
}

const ACCENT_HOVER: Record<string, string> = {
  purple: 'hover:border-purple-200',
  blue: 'hover:border-blue-200',
  orange: 'hover:border-orange-200',
  cyan: 'hover:border-cyan-200',
  emerald: 'hover:border-emerald-200',
};

/** Consistent stat card for student / intern dashboards */
export function DashStatCard({
  label,
  hint,
  value,
  footer,
  icon: Icon,
  iconClass = 'text-slate-500',
  to,
  accent = 'blue',
  children,
}: DashStatCardProps) {
  const body = (
    <>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 ring-1 ring-slate-100">
          <Icon className={`h-4 w-4 ${iconClass}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-[10px] text-slate-400 leading-snug">{hint}</p>
        </div>
      </div>
      <p className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums leading-none">{value}</p>
      {footer && <p className="mt-2 text-xs text-slate-500 leading-relaxed">{footer}</p>}
      {children}
    </>
  );

  const cls = `flex flex-col h-full bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-sm lms-card-lift transition-colors duration-300 ease-out ${ACCENT_HOVER[accent]}`;

  if (to) {
    return (
      <Link to={to} className={cls} title={`View ${label.toLowerCase()}`}>
        {body}
      </Link>
    );
  }

  return <div className={cls}>{body}</div>;
}
