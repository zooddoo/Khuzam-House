import type { ReactNode } from 'react';
import { AlertTriangle, CircleAlert, Info, Loader2, type LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { TONE_DOT, TONE_SOFT, type Tone } from '@/lib/labels';

export function Dot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT[tone], className)} />;
}

/** Quiet status label: colored dot + text. */
export function StatusLabel({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-ink-2', className)}>
      <Dot tone={tone} />
      {children}
    </span>
  );
}

export function Badge({ tone = 'neutral', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn('inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-[3px] px-1.5 text-[11px] font-medium', TONE_SOFT[tone], className)}
    >
      {children}
    </span>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('animate-spin text-ink-3', className)} aria-label="Loading" />;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-10 text-[13px] text-ink-3">
      <Spinner size={15} /> {label}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
  compact,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-md border border-dashed border-line-strong/70 text-center',
        compact ? 'px-5 py-8' : 'px-6 py-16',
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-mist text-ink-3">
          <Icon size={19} strokeWidth={1.5} />
        </div>
      )}
      <h3 className="display text-[22px] text-ink">{title}</h3>
      {children && <div className="mt-2 max-w-[440px] text-[13px] leading-relaxed text-ink-3">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="display text-[40px] text-ink sm:text-[46px]">{title}</h1>
        {description && <p className="mt-2 max-w-[640px] text-[13.5px] leading-relaxed text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h2 className="display text-[26px] text-ink">{title}</h2>
        {description && <p className="mt-1 max-w-[680px] text-[12.5px] leading-relaxed text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Small uppercase label above a group of fields. */
export function GroupLabel({ children, className, actions }: { children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-2 border-b border-line pb-2', className)}>
      <span className="eyebrow">{children}</span>
      {actions}
    </div>
  );
}

const CALLOUT = {
  info: { icon: Info, cls: 'border-info/25 bg-info-soft/60 text-ink-2', iconCls: 'text-info' },
  warn: { icon: AlertTriangle, cls: 'border-warn/30 bg-warn-soft/70 text-ink-2', iconCls: 'text-warn' },
  danger: { icon: CircleAlert, cls: 'border-danger/30 bg-danger-soft/70 text-ink-2', iconCls: 'text-danger' },
  neutral: { icon: Info, cls: 'border-line bg-mist/60 text-ink-2', iconCls: 'text-ink-3' },
};

export function Callout({
  tone = 'info',
  title,
  children,
  action,
  className,
  icon,
}: {
  tone?: keyof typeof CALLOUT;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: LucideIcon;
}) {
  const c = CALLOUT[tone];
  const Icon = icon ?? c.icon;
  return (
    <div className={cn('flex gap-3 rounded-md border px-3.5 py-3 text-[12.5px] leading-relaxed', c.cls, className)}>
      <Icon size={16} strokeWidth={1.75} className={cn('mt-0.5 shrink-0', c.iconCls)} />
      <div className="min-w-0 flex-1">
        {title && <div className="font-medium text-ink">{title}</div>}
        {children && <div className={title ? 'mt-0.5' : undefined}>{children}</div>}
        {action && <div className="mt-2.5 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[3px] border border-line bg-raised px-1 font-sans text-[10.5px] font-medium text-ink-3">
      {children}
    </kbd>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-sm bg-mist', className)} />;
}

export function KeyValue({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="eyebrow mb-1">{label}</div>
      <div className="text-[13.5px] text-ink">{children}</div>
    </div>
  );
}

export function Card({ children, className, as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' }) {
  return <As className={cn('rounded-md border border-line bg-surface', className)}>{children}</As>;
}
