import { useEffect, useId, useRef, useState } from 'react';
import type { Certainty, LengthUnit, Measure } from '@/lib/types';
import { formatInputValue, parseLength, unitLabel } from '@/lib/units';
import { certaintyMeta } from '@/lib/labels';
import { useT } from '@/i18n';
import { cn } from './cn';
import { inputClass } from './Form';
import { Popover, PopoverClose } from './Overlay';

/**
 * Length input with explicit certainty. Values are stored in mm; the field
 * shows the room's display unit. Clearing the field marks the value Unknown.
 */
export function MeasureInput({
  label,
  value,
  unit,
  onChange,
  defaultCertainty = 'confirmed',
  hint,
  allowZero,
  disabled,
  readOnlyReason,
  compact,
  className,
  max,
  live,
}: {
  label?: string;
  value: Measure;
  unit: LengthUnit;
  onChange: (m: Measure) => void;
  defaultCertainty?: 'confirmed' | 'estimated';
  hint?: string;
  allowZero?: boolean;
  disabled?: boolean;
  /** When set, the field is read-only and explains why (e.g. derived values). */
  readOnlyReason?: string;
  compact?: boolean;
  className?: string;
  max?: number;
  /** Commit valid values while typing (debounced), so derived values update immediately. */
  live?: boolean;
}) {
  const t = useT();
  const id = useId();
  const [text, setText] = useState(formatInputValue(value.mm, unit));
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (!focused.current) {
      setText(formatInputValue(value.mm, unit));
      setError(null);
    }
  }, [value.mm, unit]);

  const commit = () => {
    if (timer.current) clearTimeout(timer.current);
    const r = parseLength(text, unit, { allowZero, max });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    if (r.mm === value.mm) {
      setText(formatInputValue(value.mm, unit));
      return;
    }
    if (r.mm === null) onChange({ mm: null, certainty: 'unknown' });
    else onChange({ mm: r.mm, certainty: value.mm === null || value.certainty === 'unknown' ? defaultCertainty : value.certainty });
  };

  const readOnly = !!readOnlyReason;

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-[12px] font-medium text-ink-2">
          {label}
        </label>
      )}
      <div className="flex items-stretch gap-1.5">
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            inputMode="decimal"
            value={text}
            disabled={disabled}
            readOnly={readOnly}
            title={readOnlyReason}
            placeholder={t.common.unknown}
            onFocus={() => (focused.current = true)}
            onBlur={() => {
              focused.current = false;
              commit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setText(formatInputValue(value.mm, unit));
                setError(null);
              }
            }}
            onChange={(e) => {
              const next = e.target.value;
              setText(next);
              if (live) {
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => {
                  const r = parseLength(next, unit, { allowZero, max });
                  if (r.ok && r.mm !== null && r.mm !== value.mm) {
                    setError(null);
                    onChange({ mm: r.mm, certainty: value.mm === null || value.certainty === 'unknown' ? defaultCertainty : value.certainty });
                  }
                }, 280);
              }
            }}
            aria-invalid={!!error}
            className={cn(
              inputClass,
              compact ? 'h-10 pe-9 text-[14px] sm:h-8 sm:text-[13px]' : 'h-11 pe-10 text-[15px] sm:h-9 sm:text-[13.5px]',
              'tabular',
              readOnly && 'cursor-default bg-mist/50 text-ink-2 hover:border-line focus:ring-0',
              error && 'border-danger focus:border-danger',
            )}
          />
          <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-[12px] text-ink-3">{unitLabel(unit)}</span>
        </div>
        <CertaintyPicker
          value={value}
          disabled={disabled || readOnly || value.mm === null}
          onChange={(c) => onChange({ ...value, certainty: c })}
          compact={compact}
        />
      </div>
      {error ? (
        <p className="text-[11.5px] text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[11.5px] text-ink-3">{hint}</p>
      ) : readOnlyReason && !compact ? (
        <p className="text-[11.5px] text-ink-3">{readOnlyReason}</p>
      ) : null}
    </div>
  );
}

const CHIP: Record<Certainty, string> = {
  confirmed: 'border-ok/30 bg-ok-soft text-ok',
  estimated: 'border-warn/30 bg-warn-soft text-warn',
  unknown: 'border-line bg-mist text-ink-3',
};

export function CertaintyPicker({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: Measure;
  onChange: (c: 'confirmed' | 'estimated') => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const t = useT();
  const c: Certainty = value.mm === null ? 'unknown' : value.certainty;
  const meta = certaintyMeta(c);
  const chip = (
    <button
      type="button"
      disabled={disabled}
      title={meta.hint}
      aria-label={t.measure.certaintyAria(meta.label)}
      className={cn(
        'inline-flex shrink-0 items-center rounded-sm border px-2 text-[11px] font-medium transition-colors disabled:cursor-default',
        compact ? 'h-10 sm:h-8' : 'h-11 sm:h-9',
        CHIP[c],
      )}
    >
      {t.enums.certainty[c]}
    </button>
  );
  if (disabled) return chip;
  return (
    <Popover trigger={chip} align="end" className="w-[240px] p-1">
      {(['confirmed', 'estimated'] as const).map((opt) => {
        const m = certaintyMeta(opt);
        return (
          <PopoverClose asChild key={opt}>
            <button
              type="button"
              onClick={() => onChange(opt)}
              className={cn('flex w-full flex-col items-start rounded-sm px-2.5 py-2 text-start hover:bg-mist', c === opt && 'bg-mist')}
            >
              <span className="text-[13px] font-medium text-ink">{m.label}</span>
              <span className="text-[11.5px] text-ink-3">{m.hint}</span>
            </button>
          </PopoverClose>
        );
      })}
      <p className="px-2.5 pb-1.5 pt-1 text-[11px] leading-relaxed text-ink-4">{t.measure.clearToUnknown}</p>
    </Popover>
  );
}

/** Plain optional number in mm (for element/furniture fields), shown in the display unit. */
export function LengthField({
  label,
  value,
  unit,
  onChange,
  allowZero,
  placeholder,
  compact,
  hint,
  className,
  required,
}: {
  label?: string;
  value: number | null;
  unit: LengthUnit;
  onChange: (mm: number | null) => void;
  allowZero?: boolean;
  placeholder?: string;
  compact?: boolean;
  hint?: string;
  className?: string;
  required?: boolean;
}) {
  const t = useT();
  const id = useId();
  const [text, setText] = useState(formatInputValue(value, unit));
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(formatInputValue(value, unit));
  }, [value, unit]);
  const commit = () => {
    const r = parseLength(text, unit, { allowZero });
    if (!r.ok) return setError(r.error);
    if (required && r.mm === null) {
      setError(t.common.required);
      return;
    }
    setError(null);
    if (r.mm !== value) onChange(r.mm);
  };
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-[12px] font-medium text-ink-2">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          value={text}
          placeholder={placeholder ?? t.common.unknown}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            commit();
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          onChange={(e) => setText(e.target.value)}
          className={cn(
            inputClass,
            'tabular',
            compact ? 'h-10 pe-9 text-[14px] sm:h-8 sm:text-[13px]' : 'h-11 pe-10 text-[15px] sm:h-9 sm:text-[13.5px]',
            error && 'border-danger',
          )}
        />
        <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-[12px] text-ink-3">{unitLabel(unit)}</span>
      </div>
      {error ? <p className="text-[11.5px] text-danger">{error}</p> : hint ? <p className="text-[11.5px] text-ink-3">{hint}</p> : null}
    </div>
  );
}
