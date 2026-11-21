import { describe, expect, it } from 'vitest';
import { parseRequirementsText, suggestCategory } from './parse';

describe('offline requirement parser', () => {
  it('splits bullets, uses headings as categories and detects priority and exclusions', () => {
    const out = parseRequirementsText(`Storage:
- Must have a full-height cabinet for board games
- Hidden storage for cushions

Lighting:
- Warm indirect lighting (must)
- Optional: a reading lamp
- No harsh downlights`);
    expect(out).toHaveLength(5);
    expect(out[0]).toMatchObject({ category: 'storage', priority: 'must', kind: 'want' });
    expect(out[1].category).toBe('storage');
    expect(out[2]).toMatchObject({ title: 'Warm indirect lighting', category: 'lighting', priority: 'must' });
    expect(out[3]).toMatchObject({ title: 'A reading lamp', priority: 'optional' });
    expect(out[4]).toMatchObject({ kind: 'avoid', category: 'lighting' });
  });

  it('keeps continuation lines with their bullet', () => {
    const out = parseRequirementsText('- A large dining table\n  seating ten guests\n- Two armchairs');
    expect(out).toHaveLength(2);
    expect(`${out[0].title} ${out[0].description}`).toContain('seating ten guests');
  });

  it('treats blank-line separated paragraphs as separate requirements', () => {
    const out = parseRequirementsText('We want a calm bedroom with blackout curtains.\n\nThe bed should face the window.');
    expect(out).toHaveLength(2);
    expect(out[1].category).toBe('furniture');
  });

  it('understands common Arabic keywords', () => {
    const out = parseRequirementsText('- ضروري خزانة كبيرة للملابس\n- لا نريد ألوان داكنة');
    expect(out[0]).toMatchObject({ priority: 'must', category: 'storage' });
    expect(out[1].kind).toBe('avoid');
  });

  it('uses the default priority when none is mentioned', () => {
    const out = parseRequirementsText('- Wooden ceiling slats', { priority: 'optional' });
    expect(out[0]).toMatchObject({ priority: 'optional', category: 'materials' });
  });

  it('suggests categories while typing', () => {
    expect(suggestCategory('A pendant light over the table')).toBe('lighting');
    expect(suggestCategory('Sofa facing the TV')).toBe('furniture');
  });
});
