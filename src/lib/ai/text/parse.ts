import type { Priority, RequirementCategory } from '../../types';

export interface ParsedRequirement {
  title: string;
  description: string;
  category: RequirementCategory;
  priority: Priority;
  kind: 'want' | 'avoid';
  group: string;
  notes: string;
}

const BULLET = /^\s*(?:[-*•◦▪‣–—]|\(?[0-9٠-٩]{1,3}[.)]|\(?[a-z][.)])\s+/i;

const CATEGORY_WORDS: [RequirementCategory, RegExp][] = [
  ['storage', /\b(storage|store|cabinet|cupboard|wardrobe|closet|shel(f|ves)|drawer|pantry|built-?in)\b|تخزين|خزان|دولاب|رف|أدراج|ادراج/i],
  ['lighting', /\b(light|lighting|lamp|chandelier|pendant|spot ?light|led|sconce|dimm|lux|kelvin)\b|إضاء|اضاء|نور|ثريا|أباجورة/i],
  ['colors', /\b(colou?r|palette|beige|white|black|grey|gray|green|blue|navy|cream|tone|shade|neutral)\b|لون|ألوان|الوان|بيج|أبيض|ابيض/i],
  [
    'materials',
    /\b(wood(en)?|oak|walnut|teak|marble|stone|travertine|tiles?|fabrics?|leather|brass|metal(lic)?|rattan|linen|velvet|bouc\w*|plaster|concrete|glass|veneer|microcement|terrazzo)\b|خشب|رخام|حجر|قماش|جلد|نحاس|بلاط/i,
  ],
  [
    'furniture',
    /\b(sofa|couch|chair|armchair|table|bed|desk|ottoman|bench|stool|sideboard|console|sectional|seating|nightstand|dresser)\b|كنب|كنبة|طاولة|كرسي|سرير|مكتب|جلسة/i,
  ],
  [
    'layout',
    /\b(layout|place|placement|position|corner|zone|arrange|opposite|beside|next to|facing|centre|center|circulation|flow|open plan)\b|توزيع|مكان|زاوية|ركن|مقابل|بجانب/i,
  ],
  [
    'architectural',
    /\b(window|door|column|beam|ceiling|ac\b|air ?con|wall|niche|opening|stair|floor level|structure)\b|نافذة|شباك|باب|عمود|سقف|مكيف|جدار|حائط/i,
  ],
  [
    'functional',
    /\b(kids?|children|child|guest|hosting|clean|durable|wash|safe|safety|accessible|elderly|pet|work from home|study|cooking|maintenance)\b|أطفال|اطفال|ضيوف|سهل التنظيف|آمن|امن/i,
  ],
  [
    'style',
    /\b(style|modern|minimal|minimalist|classic|japandi|luxury|contemporary|scandi|industrial|rustic|boho|cozy|cosy|warm|calm|elegant|mood|feel)\b|ستايل|طراز|مودرن|كلاسيك|فخم|هادئ/i,
  ],
];

const MUST = /\b(must|need|needs|required|essential|important|have to|mandatory|necessary|non-negotiable)\b|ضروري|لازم|يجب|لابد|مهم/i;
const OPTIONAL = /\b(optional|maybe|if possible|could|nice to have|would be nice|consider|perhaps)\b|اختياري|ممكن|إن أمكن|ان امكن|يا ليت/i;
const PREFER = /\b(prefer|preferably|ideally|would like|i'd like|like to have)\b|أفضل|افضل|يفضل|أحب|احب/i;
const AVOID =
  /^\s*(no|not|don't|do not|avoid|without|never|nothing|none)\b|^\s*(لا|بدون|ما أبغى|ما ابغى|ما ابي|بلاش)\s|\b(avoid|don't want|do not want|no more)\b/i;

function detectCategory(text: string, fallback: RequirementCategory | null): RequirementCategory {
  for (const [cat, re] of CATEGORY_WORDS) if (re.test(text)) return cat;
  return fallback ?? 'other';
}

function categoryFromHeading(h: string): RequirementCategory | null {
  const t = h.toLowerCase();
  for (const [cat, re] of CATEGORY_WORDS) if (re.test(t) || t.includes(cat)) return cat;
  if (/furnit/.test(t)) return 'furniture';
  return null;
}

function priorityOf(text: string, fallback: Priority): Priority {
  if (MUST.test(text)) return 'must';
  if (OPTIONAL.test(text)) return 'optional';
  if (PREFER.test(text)) return 'preferred';
  return fallback;
}

const PRIORITY_PREFIX = /^(must[- ]have|must|optional|preferred|nice[- ]to[- ]have|important|required|essential|ضروري|اختياري)\s*[:：\-–—]\s*/i;
const PRIORITY_MARKER = /\s*\((must|must[- ]have|optional|preferred|nice[- ]to[- ]have|important|required)\)\s*/gi;

/** Remove priority labels like "Optional:" or "(must)" — the priority field already holds them. */
export function cleanRequirementText(text: string): string {
  return text.replace(PRIORITY_PREFIX, '').replace(PRIORITY_MARKER, ' ').replace(/\s+/g, ' ').trim();
}

function titleFrom(text: string): string {
  const stripped = cleanRequirementText(text);
  const clean = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  const sentence = clean.split(/(?<=[.!?؟])\s+|\s[–—-]\s|:\s/)[0] ?? clean;
  if (sentence.length <= 90) return sentence.replace(/[.;,]$/, '');
  const cut = sentence.slice(0, 87);
  return `${cut.slice(0, Math.max(40, cut.lastIndexOf(' ')))}…`;
}

function isHeading(line: string, next: string | undefined): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^#{1,6}\s/.test(t)) return true;
  if (/[:：]$/.test(t) && t.length <= 60 && !BULLET.test(t)) return true;
  if (t.length <= 40 && t === t.toUpperCase() && /[A-Z]/.test(t) && next !== undefined && BULLET.test(next)) return true;
  return false;
}

/**
 * Offline parser for pasted requirement lists. Handles bullets, numbering,
 * headings (used as group/category), Arabic and English keywords for
 * priority, exclusions and categories. Nothing is invented: titles and
 * descriptions come from the user's text.
 */
export function parseRequirementsText(input: string, defaults: { priority?: Priority } = {}): ParsedRequirement[] {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const usesBullets = lines.some((l) => BULLET.test(l));
  const items: { text: string; heading: string }[] = [];
  let heading = '';
  const paragraphs = !usesBullets && /\n\s*\n/.test(input.trim());

  if (paragraphs) {
    let buf: string[] = [];
    const flush = () => {
      const t = buf.join(' ').trim();
      if (t) items.push({ text: t, heading });
      buf = [];
    };
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.trim()) {
        flush();
        continue;
      }
      if (!buf.length && isHeading(l, lines[i + 1])) {
        heading = l
          .trim()
          .replace(/^#+\s*/, '')
          .replace(/[:：]$/, '');
        continue;
      }
      buf.push(l.trim());
    }
    flush();
  } else {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.trim()) continue;
      if (isHeading(l, lines[i + 1])) {
        heading = l
          .trim()
          .replace(/^#+\s*/, '')
          .replace(/[:：]$/, '');
        continue;
      }
      if (usesBullets) {
        if (BULLET.test(l)) items.push({ text: l.replace(BULLET, '').trim(), heading });
        else if (items.length) items[items.length - 1].text += ` ${l.trim()}`;
        else items.push({ text: l.trim(), heading });
      } else {
        items.push({ text: l.trim(), heading });
      }
    }
  }

  return items
    .filter((it) => it.text.replace(/[^\p{L}\p{N}]/gu, '').length > 1)
    .map(({ text, heading: h }) => {
      const headingCat = h ? categoryFromHeading(h) : null;
      const avoid = AVOID.test(text);
      const headingPriority = h ? priorityOf(h, defaults.priority ?? 'preferred') : (defaults.priority ?? 'preferred');
      const title = titleFrom(text);
      const body = cleanRequirementText(text);
      return {
        title,
        description: body.length > title.length + 2 ? text : '',
        category: detectCategory(`${text}`, headingCat),
        priority: priorityOf(text, headingPriority),
        kind: avoid ? 'avoid' : 'want',
        group: h && !headingCat ? h : '',
        notes: '',
      } satisfies ParsedRequirement;
    });
}

/** Suggest a category for a single requirement as the user types. */
export function suggestCategory(text: string): RequirementCategory {
  return detectCategory(text, null);
}

export function suggestPriority(text: string): Priority | null {
  if (MUST.test(text)) return 'must';
  if (OPTIONAL.test(text)) return 'optional';
  if (PREFER.test(text)) return 'preferred';
  return null;
}

export function looksLikeExclusion(text: string): boolean {
  return AVOID.test(text);
}
