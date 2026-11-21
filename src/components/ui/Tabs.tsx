import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { useT } from '@/i18n';

export interface TabDef {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: ReactNode;
}

/** Route-based tabs (each tab is a link) — keeps tabs bookmarkable and back-button friendly. */
export function LinkTabs({ tabs, base, className }: { tabs: TabDef[]; base: string; className?: string }) {
  const t = useT();
  return (
    <nav aria-label={t.ui.sections} className={cn('scroll-thin -mx-1 flex gap-0.5 overflow-x-auto border-b border-line px-1', className)}>
      {tabs.map((t) => {
        const Icon = t.icon;
        return (
          <NavLink
            key={t.id}
            to={`${base}/${t.id}`}
            className={({ isActive }) =>
              cn(
                'relative inline-flex h-11 shrink-0 items-center gap-1.5 px-3 text-[13px] transition-colors sm:h-10',
                isActive ? 'text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-[2px] after:bg-ink' : 'text-ink-3 hover:text-ink',
              )
            }
          >
            {Icon && <Icon size={14} strokeWidth={1.75} />}
            {t.label}
            {t.badge !== undefined && t.badge !== null && t.badge !== 0 && (
              <span className="ms-0.5 rounded-full bg-mist px-1.5 text-[10.5px] font-medium text-ink-3 tabular">{t.badge}</span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

/** State-based tabs. */
export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { id: T; label: string; icon?: LucideIcon; badge?: ReactNode }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('scroll-thin -mx-1 flex gap-0.5 overflow-x-auto border-b border-line px-1', className)}>
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = value === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              'relative inline-flex h-11 shrink-0 items-center gap-1.5 px-3 text-[13px] transition-colors sm:h-10',
              active ? 'text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-[2px] after:bg-ink' : 'text-ink-3 hover:text-ink',
            )}
          >
            {Icon && <Icon size={14} strokeWidth={1.75} />}
            {t.label}
            {t.badge !== undefined && t.badge !== null && t.badge !== 0 && (
              <span className="ms-0.5 rounded-full bg-mist px-1.5 text-[10.5px] font-medium text-ink-3 tabular">{t.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
