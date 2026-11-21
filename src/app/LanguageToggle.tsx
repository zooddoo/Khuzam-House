import { Languages } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cn } from '@/components/ui/cn';

/** One-tap switch between Arabic and English (remembered on this device). */
export function LanguageToggle({ className, compact }: { className?: string; compact?: boolean }) {
  const { t, lang, setLang } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
      aria-label={t.nav.switchToLabel}
      title={t.nav.switchToLabel}
      lang={lang === 'ar' ? 'en' : 'ar'}
      className={cn(
        'touch-target inline-flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-[13px] font-medium text-ink-2 hover:bg-mist hover:text-ink',
        className,
      )}
    >
      <Languages size={16} strokeWidth={1.6} />
      {!compact && <span>{t.nav.switchTo}</span>}
    </button>
  );
}
