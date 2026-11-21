import { setPrefs } from './i18n/prefs';

// Unit tests check English messages unless a test switches language itself.
setPrefs({ lang: 'en', digits: 'latn', calendar: 'gregory' });
