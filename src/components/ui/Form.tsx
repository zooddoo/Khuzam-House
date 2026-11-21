import {
  cloneElement,
  forwardRef,
  isValidElement,
  type ReactElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from './cn';
import { useT } from '@/i18n';

export const inputClass =
  'w-full rounded-sm border border-line bg-raised px-3 text-[13.5px] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-4 hover:border-line-strong focus:border-ink-3 focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-mist/60 disabled:text-ink-3';

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
  aside,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
  aside?: ReactNode;
}) {
  // Associate the label with a single child control (inputs, selects, textareas)
  // so it is announced by screen readers and clickable.
  const autoId = useId();
  const childId = isValidElement(children) ? ((children.props as { id?: string }).id ?? autoId) : undefined;
  const control = isValidElement(children) && !htmlFor ? cloneElement(children as ReactElement<{ id?: string }>, { id: childId }) : children;
  const forId = htmlFor ?? childId;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {(label || aside) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && (
            <label htmlFor={forId} className="text-[12px] font-medium text-ink-2">
              {label}
            </label>
          )}
          {aside}
        </div>
      )}
      {control}
      {error ? <p className="text-[11.5px] text-danger">{error}</p> : hint ? <p className="text-[11.5px] leading-relaxed text-ink-3">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      dir="auto"
      className={cn(inputClass, 'h-11 text-[15px] sm:h-9 sm:text-[13.5px]', invalid && 'border-danger focus:border-danger focus:ring-danger/15', className)}
      {...rest}
    />
  );
});

/** Textarea that grows with its content. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; maxRows?: number }>(function Textarea(
  { className, minRows = 2, maxRows = 14, value, onChange, ...rest },
  forwarded,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const resize = () => {
    const el = inner.current;
    if (!el) return;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.style.height = 'auto';
    const min = lh * minRows + 14;
    const max = lh * maxRows + 14;
    el.style.height = `${Math.min(max, Math.max(min, el.scrollHeight + 2))}px`;
    el.style.overflowY = el.scrollHeight + 2 > max ? 'auto' : 'hidden';
  };
  useLayoutEffect(resize, [value, minRows, maxRows]);
  return (
    <textarea
      ref={(el) => {
        inner.current = el;
        if (typeof forwarded === 'function') forwarded(el);
        else if (forwarded) forwarded.current = el;
      }}
      dir="auto"
      value={value}
      onChange={(e) => {
        onChange?.(e);
        resize();
      }}
      className={cn(inputClass, 'scroll-thin resize-none py-2 text-[15px] leading-relaxed sm:text-[13.5px]', className)}
      {...rest}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(inputClass, 'h-11 appearance-none pe-8 text-[15px] sm:h-9 sm:text-[13.5px]', className)} {...rest}>
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
    </div>
  );
});

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  size = 'md',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-3', disabled && 'opacity-50')}>
      <button
        id={id}
        role="switch"
        type="button"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 shrink-0 rounded-full transition-colors', size === 'sm' ? 'h-4 w-7' : 'h-5 w-9', checked ? 'bg-ink' : 'bg-line-strong')}
      >
        <span
          className={cn(
            'absolute start-0 top-0.5 rounded-full bg-white shadow-sm transition-transform',
            size === 'sm' ? 'h-3 w-3' : 'h-4 w-4',
            checked
              ? size === 'sm'
                ? 'translate-x-3.5 rtl:-translate-x-3.5'
                : 'translate-x-4.5 rtl:-translate-x-4.5'
              : 'translate-x-0.5 rtl:-translate-x-0.5',
          )}
        />
      </button>
      {(label || description) && (
        <label htmlFor={id} className="min-w-0 cursor-pointer select-none">
          {label && <span className="block text-[13px] text-ink">{label}</span>}
          {description && <span className="block text-[11.5px] leading-relaxed text-ink-3">{description}</span>}
        </label>
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('scroll-thin inline-flex max-w-full self-start overflow-x-auto rounded-sm border border-line bg-mist/70 p-0.5', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'shrink-0 whitespace-nowrap rounded-[2px] font-medium transition-colors',
            size === 'sm' ? 'h-8 px-2 text-[12px] sm:h-6 sm:text-[11.5px]' : 'h-9 px-2.5 text-[13px] sm:h-7 sm:text-[12.5px]',
            value === o.value ? 'bg-raised text-ink shadow-[0_1px_2px_rgb(38_34_29/0.12)]' : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-2.5', disabled && 'opacity-50', className)}>
      <button
        id={id}
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border transition-colors',
          checked ? 'border-ink bg-ink text-canvas' : 'border-line-strong bg-raised hover:border-ink-3',
        )}
      >
        {checked && <Check size={11} strokeWidth={2.5} />}
      </button>
      {(label || description) && (
        <label htmlFor={id} className="min-w-0 cursor-pointer select-none">
          {label && <span className="block text-[13px] leading-snug text-ink">{label}</span>}
          {description && <span className="block text-[11.5px] leading-relaxed text-ink-3">{description}</span>}
        </label>
      )}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  className,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors sm:h-7 sm:text-[12px]',
        active ? 'border-ink bg-ink text-canvas' : 'border-line bg-raised text-ink-2 hover:border-line-strong hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Free-form tag entry: Enter or comma adds a tag. */
export function TagInput({
  value,
  onChange,
  placeholder,
  suggestions = [],
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const add = (t: string) => {
    const clean = t.trim().replace(/,$/, '');
    if (!clean || value.includes(clean)) return;
    onChange([...value, clean]);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
      setDraft('');
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const listId = useId();
  return (
    <div className={cn(inputClass, 'flex min-h-9 flex-wrap items-center gap-1.5 py-1.5')}>
      {value.map((tag) => (
        <span key={tag} dir="auto" className="inline-flex items-center gap-1 rounded-full bg-mist px-2 py-0.5 text-[12px] text-ink-2">
          {tag}
          <button type="button" aria-label={t.ui.remove(tag)} onClick={() => onChange(value.filter((x) => x !== tag))} className="p-0.5 text-ink-3 hover:text-ink">
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        dir="auto"
        list={suggestions.length ? listId : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => {
          add(draft);
          setDraft('');
        }}
        placeholder={value.length ? '' : (placeholder ?? t.forms.addTag)}
        className="min-w-[80px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-4"
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions
            .filter((s) => !value.includes(s))
            .map((s) => (
              <option key={s} value={s} />
            ))}
        </datalist>
      )}
    </div>
  );
}

/**
 * Text input that edits locally and commits on blur / Enter — avoids a DB
 * write on every keystroke while still auto-saving.
 */
export function CommitInput({
  value,
  onCommit,
  multiline,
  className,
  minRows,
  ...rest
}: {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  className?: string;
  minRows?: number;
  placeholder?: string;
  'aria-label'?: string;
  id?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (draft !== value) onCommit(draft);
  };
  if (multiline) {
    return (
      <Textarea
        {...rest}
        minRows={minRows}
        value={draft}
        className={className}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onChange={(e) => setDraft(e.target.value)}
      />
    );
  }
  return (
    <Input
      {...rest}
      value={draft}
      className={className}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          cancelled.current = true;
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      onChange={(e) => setDraft(e.target.value)}
    />
  );
}
