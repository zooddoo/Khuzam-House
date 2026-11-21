import * as RadixDialog from '@radix-ui/react-dialog';
import * as RadixPopover from '@radix-ui/react-popover';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import { X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { useT } from '@/i18n';

/* Tooltip ------------------------------------------------------------- */

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={350} skipDelayDuration={150}>
      {children}
    </RadixTooltip.Provider>
  );
}

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (!content) return <>{children}</>;
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="z-[70] max-w-[280px] rounded-sm bg-ink px-2 py-1 text-[11.5px] leading-snug text-canvas shadow-pop animate-fade-in"
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

/* Dialog -------------------------------------------------------------- */

const DIALOG_SIZE = {
  sm: 'max-w-[420px]',
  md: 'max-w-[560px]',
  lg: 'max-w-[760px]',
  xl: 'max-w-[1040px]',
  full: 'max-w-[min(1400px,calc(100vw-2rem))]',
};

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof DIALOG_SIZE;
  /** Prevent closing by clicking outside (for forms with unsaved input). */
  modalLock?: boolean;
  bodyClassName?: string;
}

export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md', modalLock, bodyClassName }: DialogProps) {
  const t = useT();
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px] animate-fade-in" />
        <RadixDialog.Content
          onPointerDownOutside={modalLock ? (e) => e.preventDefault() : undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-line bg-surface shadow-pop outline-none animate-rise-in',
            DIALOG_SIZE[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <RadixDialog.Title className="display text-[22px] text-ink">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{typeof title === 'string' ? title : t.ui.dialog}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label={t.ui.close}
              className="touch-target -me-1 inline-flex h-8 w-8 items-center justify-center rounded-sm text-ink-3 hover:bg-mist hover:text-ink"
            >
              <X size={16} strokeWidth={1.75} />
            </RadixDialog.Close>
          </div>
          <div className={cn('scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4', bodyClassName)}>{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Side panel drawer. */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  side = 'end',
  width = 'max-w-[560px]',
  headerExtra,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  /** 'end' = the trailing edge (right in English, left in Arabic). */
  side?: 'start' | 'end' | 'left' | 'right';
  width?: string;
  headerExtra?: ReactNode;
}) {
  const t = useT();
  const atEnd = side === 'end' || side === 'right';
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/25 animate-fade-in" />
        <RadixDialog.Content
          className={cn(
            'fixed top-0 z-50 flex h-dvh w-full flex-col border-line bg-surface shadow-pop outline-none animate-fade-in',
            atEnd ? 'end-0 border-s' : 'start-0 border-e',
            width,
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <RadixDialog.Title className="display min-w-0 truncate text-[22px]">{title}</RadixDialog.Title>
            <div className="flex items-center gap-1">
              {headerExtra}
              <RadixDialog.Close
                aria-label={t.ui.close}
                className="touch-target inline-flex h-8 w-8 items-center justify-center rounded-sm text-ink-3 hover:bg-mist hover:text-ink"
              >
                <X size={16} strokeWidth={1.75} />
              </RadixDialog.Close>
            </div>
          </div>
          <RadixDialog.Description className="sr-only">{t.ui.details}</RadixDialog.Description>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/* Popover ------------------------------------------------------------- */

export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  align = 'start',
  side = 'bottom',
  className,
}: {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className={cn('z-[60] rounded-md border border-line bg-raised p-3 shadow-pop outline-none animate-rise-in', className)}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

export const PopoverClose = RadixPopover.Close;

/* Menu ---------------------------------------------------------------- */

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

export type MenuEntry = MenuItem | 'separator' | { heading: string };

export function Menu({ trigger, items, align = 'end' }: { trigger: ReactNode; items: MenuEntry[]; align?: 'start' | 'end' | 'center' }) {
  return (
    <RadixMenu.Root modal={false}>
      <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] min-w-[200px] rounded-md border border-line bg-raised p-1 shadow-pop animate-rise-in"
        >
          {items.map((it, i) => {
            if (it === 'separator') return <RadixMenu.Separator key={i} className="my-1 h-px bg-line" />;
            if ('heading' in it)
              return (
                <RadixMenu.Label key={i} className="eyebrow px-2.5 pb-1 pt-2">
                  {it.heading}
                </RadixMenu.Label>
              );
            const Icon = it.icon;
            return (
              <RadixMenu.Item
                key={i}
                disabled={it.disabled}
                onSelect={it.onSelect}
                className={cn(
                  'touch-row flex cursor-pointer select-none items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13px] outline-none data-[disabled]:cursor-not-allowed data-[highlighted]:bg-mist data-[disabled]:opacity-40',
                  it.danger ? 'text-danger data-[highlighted]:bg-danger-soft' : 'text-ink',
                )}
              >
                {Icon && <Icon size={14} strokeWidth={1.75} className={it.danger ? '' : 'text-ink-3'} />}
                <span className="flex-1">{it.label}</span>
                {it.hint && <span className="text-[11px] text-ink-4">{it.hint}</span>}
              </RadixMenu.Item>
            );
          })}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}
