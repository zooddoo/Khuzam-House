import { useState } from 'react';
import { Languages, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { TextProviderSettings } from '@/lib/types';
import { textProviderReady } from '@/lib/ai/text/structure';
import { translateToEnglish } from '@/lib/ai/text/translate';
import { setTranslation } from '@/lib/translate/memory';
import { describeError } from '@/lib/ai/http';
import { EnglishField } from '@/components/translate/EnglishField';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Display';
import { useT } from '@/i18n';

/**
 * Arabic texts used in this design that the English prompt needs. Each can be
 * typed in English, or translated automatically when an AI text assistant is
 * configured (the owner checks the result). Nothing Arabic is dropped: until
 * every text has English, the prompt cannot be copied or generated.
 */
export function TranslationsSection({
  untranslated,
  used,
  textProvider,
}: {
  untranslated: { source: string }[];
  used: { source: string; en: string }[];
  textProvider: TextProviderSettings;
}) {
  const t = useT();
  const T = t.translate;
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const ready = textProviderReady(textProvider).ready;

  const translateAll = async () => {
    if (!untranslated.length) return;
    setBusy(true);
    const controller = new AbortController();
    try {
      const sources = untranslated.map((u) => u.source);
      const out = await translateToEnglish(sources, textProvider, controller.signal);
      let count = 0;
      for (let i = 0; i < sources.length; i++) {
        if (out[i]) {
          await setTranslation(sources[i], out[i], 'auto');
          count++;
        }
      }
      toast.success(T.done(count));
    } catch (e) {
      toast.error(T.failed(describeError(e).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-md border border-line bg-surface p-4" aria-labelledby="studio-translations">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="studio-translations" className="flex items-center gap-2 text-[15px] font-medium text-ink">
            <Languages size={16} /> {T.panelTitle}
          </h3>
          <p className="mt-1 max-w-[620px] text-[12.5px] leading-relaxed text-ink-3">{T.panelLead}</p>
        </div>
        {untranslated.length > 0 &&
          (ready ? (
            <Button size="sm" icon={Sparkles} loading={busy} onClick={translateAll}>
              {busy ? T.translating : T.translateAll}
            </Button>
          ) : null)}
      </div>
      {untranslated.length > 0 ? (
        <>
          <Callout tone="warn" className="mb-3">
            {T.missingCount(untranslated.length)}
            {!ready && <div className="mt-1 text-[12px]">{T.noProvider}</div>}
          </Callout>
          <ul className="flex flex-col gap-3">
            {untranslated.map((u) => (
              <li key={u.source}>
                <div className="mb-1 text-[11px] text-ink-4">{T.source}</div>
                <div className="mb-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink" dir="auto">
                  {u.source}
                </div>
                <EnglishField source={u.source} compact />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[12.5px] text-ok">{T.allTranslated}</p>
      )}
      {used.length > 0 && (
        <div className="mt-3">
          <button type="button" className="touch-target text-[12px] text-accent hover:underline" onClick={() => setShowDone((v) => !v)}>
            {showDone ? t.common.showLess : T.reviewDone(used.length)}
          </button>
          {showDone && (
            <ul className="mt-2 flex flex-col gap-3">
              {used.map((u) => (
                <li key={u.source}>
                  <div className="mb-1 whitespace-pre-wrap text-[12.5px] text-ink-2" dir="auto">
                    {u.source}
                  </div>
                  <EnglishField source={u.source} compact />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
