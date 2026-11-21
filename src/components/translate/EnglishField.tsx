import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import { needsEnglish, setTranslation, translationId, useTranslationOf } from '@/lib/translate/memory';
import { useT } from '@/i18n';
import { Textarea } from '../ui/Form';
import { cn } from '../ui/cn';

/**
 * English version of an Arabic text, saved in the translation memory and
 * used whenever that text goes into a design prompt. Renders nothing for
 * text without Arabic.
 */
export function EnglishField({ source, className, label, compact }: { source: string; className?: string; label?: string; compact?: boolean }) {
  const t = useT();
  const existing = useTranslationOf(source);
  const [draft, setDraft] = useState('');
  useEffect(() => setDraft(existing?.en ?? ''), [existing?.en, source]);
  if (!needsEnglish(source)) return null;
  const status = existing ? (existing.method === 'auto' ? t.translate.auto : t.translate.manual) : t.translate.needed;
  return (
    <div className={cn('rounded-md border px-3 py-2.5', existing ? 'border-line bg-raised' : 'border-warn/40 bg-warn-soft/50', className)}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
        <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
          <Languages size={13} /> {label ?? t.translate.english}
        </span>
        <span className={existing ? (existing.method === 'auto' ? 'text-warn' : 'text-ok') : 'font-medium text-warn'}>{status}</span>
      </div>
      <Textarea
        dir="ltr"
        lang="en"
        minRows={compact ? 1 : 2}
        value={draft}
        placeholder={t.translate.placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() !== (existing?.en ?? '')) void setTranslation(source, draft, 'manual');
        }}
        aria-label={label ?? t.translate.english}
        className="!bg-surface"
      />
    </div>
  );
}

/** Small "needs English" marker for lists. */
export function NeedsEnglishBadge({ texts }: { texts: string[] }) {
  const t = useT();
  const arabic = texts.filter((x) => needsEnglish(x));
  const key = arabic.join('\u0000');
  const missing = useLiveQuery(async () => {
    if (!arabic.length) return 0;
    const found = await db.translations.bulkGet(arabic.map(translationId));
    return found.filter((x) => !x).length;
  }, [key]);
  if (!missing) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-[3px] bg-warn-soft px-1.5 text-[10.5px] font-medium text-warn">
      <Languages size={11} /> {t.reqs.needsEnglish}
    </span>
  );
}
