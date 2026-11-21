import { describe, expect, it } from 'vitest';
import { hasArabic, matchesSearch, normalizeForSearch, textDir, toAsciiDigits } from './arabic';

describe('Arabic search normalisation', () => {
  it('treats alef forms, taa marbuta / haa and alef maqsura / yaa as the same letter', () => {
    expect(normalizeForSearch('أإآا')).toBe('اااا');
    expect(matchesSearch('غرفة المعيشة', 'غرفه')).toBe(true);
    expect(matchesSearch('المكتبة', 'مكتبه')).toBe(true);
    expect(matchesSearch('إضاءة خافتة', 'اضاءه')).toBe(true);
    expect(matchesSearch('مستشفى', 'مستشفي')).toBe(true);
    expect(matchesSearch('أريكة', 'اريكة')).toBe(true);
  });

  it('ignores diacritics and tatweel', () => {
    expect(matchesSearch('مَجْلِسٌ', 'مجلس')).toBe(true);
    expect(matchesSearch('مـــجلس', 'مجلس')).toBe(true);
  });

  it('matches every word in any order, ignoring case', () => {
    expect(matchesSearch('Reading corner — ركن القراءة', 'القراءه reading')).toBe(true);
    expect(matchesSearch('Majlis seating', 'kitchen')).toBe(false);
    expect(matchesSearch('anything', '   ')).toBe(true);
  });

  it('converts Arabic-Indic and Persian digits', () => {
    expect(toAsciiDigits('٣٫٢٥')).toBe('3.25');
    expect(toAsciiDigits('۴۵۰')).toBe('450');
    expect(matchesSearch('Room 12', '١٢')).toBe(true);
  });

  it('detects script and direction', () => {
    expect(hasArabic('Majlis')).toBe(false);
    expect(hasArabic('المجلس')).toBe(true);
    expect(textDir('المجلس / Majlis')).toBe('rtl');
    expect(textDir('Majlis / المجلس')).toBe('ltr');
    expect(textDir('3.2 م')).toBe('rtl');
  });
});
