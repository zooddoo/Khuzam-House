import { createContext, useContext, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { DirectionProvider } from '@radix-ui/react-direction';
import { msgs, type Messages } from './messages';
import { dirOf, getPrefs, setPrefs, subscribePrefs, type CalendarPref, type DigitsPref, type Lang, type LocalePrefs } from './prefs';

export type { Lang, LocalePrefs, Messages };
export { getPrefs, setPrefs } from './prefs';
export { msgs, tr } from './messages';

interface I18nValue {
  t: Messages;
  lang: Lang;
  dir: 'rtl' | 'ltr';
  prefs: LocalePrefs;
  setLang: (lang: Lang) => void;
  setDigits: (d: DigitsPref) => void;
  setCalendar: (c: CalendarPref) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

function applyToDocument(p: LocalePrefs) {
  const root = document.documentElement;
  root.lang = p.lang;
  root.dir = dirOf(p.lang);
  document.title = msgs(p.lang).app.name;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getPrefs);

  useLayoutEffect(() => {
    applyToDocument(prefs);
  }, [prefs]);

  const value = useMemo<I18nValue>(
    () => ({
      t: msgs(prefs.lang),
      lang: prefs.lang,
      dir: dirOf(prefs.lang),
      prefs,
      setLang: (lang) => setPrefs({ lang }),
      setDigits: (digits) => setPrefs({ digits }),
      setCalendar: (calendar) => setPrefs({ calendar }),
    }),
    [prefs],
  );

  return (
    <I18nContext.Provider value={value}>
      <DirectionProvider dir={value.dir}>{children}</DirectionProvider>
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const v = useContext(I18nContext);
  if (!v) throw new Error('useI18n must be used inside <I18nProvider>');
  return v;
}

/** The current interface messages. Components re-render when the language changes. */
export function useT(): Messages {
  return useI18n().t;
}
