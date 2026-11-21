import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Tooltip } from './Overlay';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'subtle';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-canvas hover:bg-ink/88 active:bg-ink/80 disabled:bg-ink/35',
  accent: 'bg-accent text-white hover:bg-accent/90 active:bg-accent/85 disabled:bg-accent/40',
  secondary: 'border border-line-strong bg-raised text-ink hover:bg-mist hover:border-ink-4 active:bg-sand/60 disabled:text-ink-4 disabled:hover:bg-raised',
  ghost: 'text-ink-2 hover:bg-mist hover:text-ink active:bg-sand/60 disabled:text-ink-4 disabled:hover:bg-transparent',
  subtle: 'bg-mist text-ink hover:bg-sand/70 active:bg-sand disabled:text-ink-4',
  danger: 'border border-danger/30 bg-raised text-danger hover:bg-danger-soft active:bg-danger-soft/80 disabled:opacity-50',
};

const SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 px-2 text-[12px] gap-1',
  sm: 'h-8 px-2.5 text-[12.5px] gap-1.5',
  md: 'h-9 px-3.5 text-[13px] gap-2',
  lg: 'h-11 px-5 text-[14px] gap-2',
};

const ICON_SIZE: Record<ButtonSize, number> = { xs: 13, sm: 14, md: 15, lg: 17 };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-sm font-medium tracking-[0.005em] transition-colors duration-150 disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={ICON_SIZE[size]} className="animate-spin" /> : Icon ? <Icon size={ICON_SIZE[size]} strokeWidth={1.75} /> : null}
      {children}
      {IconRight && <IconRight size={ICON_SIZE[size]} strokeWidth={1.75} />}
    </button>
  );
});

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className,
  children,
  ...rest
}: LinkProps & { variant?: ButtonVariant; size?: ButtonSize; icon?: LucideIcon; children?: ReactNode }) {
  return (
    <Link
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-sm font-medium transition-colors duration-150',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={ICON_SIZE[size]} strokeWidth={1.75} />}
      {children}
    </Link>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  size?: 'xs' | 'sm' | 'md';
  variant?: 'ghost' | 'secondary' | 'danger' | 'primary' | 'overlay';
  active?: boolean;
  tooltip?: boolean;
}

const ICON_BTN_SIZE = { xs: 'h-6 w-6', sm: 'h-7 w-7', md: 'h-8 w-8' };
const ICON_BTN_VARIANT = {
  ghost: 'text-ink-3 hover:bg-mist hover:text-ink',
  secondary: 'border border-line bg-raised text-ink-2 hover:bg-mist hover:text-ink',
  danger: 'text-ink-3 hover:bg-danger-soft hover:text-danger',
  primary: 'bg-ink text-canvas hover:bg-ink/88',
  overlay: 'bg-ink/55 text-white backdrop-blur-sm hover:bg-ink/75',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = 'sm', variant = 'ghost', active, tooltip = true, className, type = 'button', ...rest },
  ref,
) {
  const btn = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40',
        ICON_BTN_SIZE[size],
        ICON_BTN_VARIANT[variant],
        active && 'bg-sand/70 text-ink',
        className,
      )}
      {...rest}
    >
      <Icon size={size === 'xs' ? 13 : size === 'sm' ? 15 : 16} strokeWidth={1.75} />
    </button>
  );
  return tooltip ? <Tooltip content={label}>{btn}</Tooltip> : btn;
});
