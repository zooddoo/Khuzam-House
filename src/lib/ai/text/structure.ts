import { tr } from '../../../i18n/messages';
import { z } from 'zod';
import type { Priority, RequirementCategory, TextProviderId, TextProviderSettings } from '../../types';
import { REQUIREMENT_CATEGORIES } from '../../labels';
import { ProviderError, providerFetch, resolveBase } from '../http';
import type { ParsedRequirement } from './parse';

/**
 * Optional AI-assisted conversion of pasted notes into structured
 * requirements. Uses an independently configured API provider — never a
 * ChatGPT account or conversation. The offline parser is always available.
 */

export interface TextProviderDef {
  id: Exclude<TextProviderId, 'none'>;
  label: string;
  defaultModel: string;
  suggestedModels: string[];
  keyUrl: string;
  keyPlaceholder: string;
  needsBaseUrl: boolean;
}

export const TEXT_PROVIDERS: TextProviderDef[] = [
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    defaultModel: 'claude-opus-5-5',
    suggestedModels: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
    keyUrl: 'https://platform.claude.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
    needsBaseUrl: false,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-5-mini',
    suggestedModels: ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini'],
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
    needsBaseUrl: false,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    suggestedModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza…',
    needsBaseUrl: false,
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible endpoint',
    defaultModel: '',
    suggestedModels: [],
    keyUrl: '',
    keyPlaceholder: 'Optional',
    needsBaseUrl: true,
  },
];

export function getTextProvider(id: TextProviderId): TextProviderDef | null {
  return TEXT_PROVIDERS.find((p) => p.id === id) ?? null;
}

export function textProviderReady(s: TextProviderSettings): { ready: boolean; label: string; problem: string | null } {
  const p = getTextProvider(s.provider);
  if (!p) return { ready: false, label: tr().providers.notSetUp, problem: tr().providers.noTextModel };
  const model = (s.models[s.provider] ?? '').trim() || p.defaultModel;
  if (p.needsBaseUrl && !/^https?:\/\//.test(s.baseUrl.trim())) return { ready: false, label: p.label, problem: tr().providers.needBaseUrl };
  if (!p.needsBaseUrl && !(s.keys[s.provider] ?? '').trim()) return { ready: false, label: p.label, problem: tr().providers.needKey('API key') };
  if (!model) return { ready: false, label: p.label, problem: tr().providers.needModel };
  return { ready: true, label: `${p.label} · ${model}`, problem: null };
}

const CATEGORY_VALUES = REQUIREMENT_CATEGORIES.map((c) => c.value);

const JSON_SCHEMA = {
  type: 'object',
  properties: {
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short title in the same language as the notes' },
          description: { type: 'string', description: 'The full requirement in the user’s words; empty if the title says it all' },
          category: { type: 'string', enum: CATEGORY_VALUES },
          priority: { type: 'string', enum: ['must', 'preferred', 'optional'] },
          kind: { type: 'string', enum: ['want', 'avoid'], description: '"avoid" when the user does NOT want something' },
          group: { type: 'string', description: 'Optional grouping label such as "Reading corner"; empty if none' },
          notes: { type: 'string', description: 'Any extra detail or uncertainty the user mentioned; empty if none' },
        },
        required: ['title', 'description', 'category', 'priority', 'kind', 'group', 'notes'],
        additionalProperties: false,
      },
    },
  },
  required: ['requirements'],
  additionalProperties: false,
} as const;

const SYSTEM = [
  'You turn a homeowner’s free-form notes about ONE room of their house into a list of structured interior-design requirements.',
  'Rules:',
  '- Keep the user’s meaning and language. If the notes are in Arabic, write titles and descriptions in Arabic.',
  '- One requirement per distinct wish or constraint. Do not merge unrelated wishes; do not split one wish into fragments.',
  '- Never add requirements, dimensions, products, or details that are not in the notes.',
  '- priority: "must" for essential / required / non-negotiable wishes; "optional" for maybe / nice-to-have; otherwise "preferred".',
  '- kind: "avoid" when the user says they do not want something (e.g. “no glossy cabinets”); otherwise "want".',
  '- category: furniture, layout, storage, colors, materials, lighting, architectural (fixed elements like windows, doors, AC, ceilings), functional, style, or other.',
  '- If something is uncertain in the notes, keep it uncertain and mention that in notes.',
].join('\n');

const resultSchema = z.object({
  requirements: z.array(
    z.object({
      title: z.string(),
      description: z.string().optional().default(''),
      category: z.string().optional().default('other'),
      priority: z.string().optional().default('preferred'),
      kind: z.string().optional().default('want'),
      group: z.string().optional().default(''),
      notes: z.string().optional().default(''),
    }),
  ),
});

function normalize(raw: unknown): ParsedRequirement[] {
  const parsed = resultSchema.safeParse(raw);
  if (!parsed.success) throw new ProviderError('The model returned data in an unexpected format.', { hint: 'Try again, or use the offline parser.' });
  return parsed.data.requirements
    .filter((r) => r.title.trim())
    .map((r) => ({
      title: r.title.trim(),
      description: r.description.trim(),
      category: (CATEGORY_VALUES as string[]).includes(r.category) ? (r.category as RequirementCategory) : 'other',
      priority: (['must', 'preferred', 'optional'].includes(r.priority) ? r.priority : 'preferred') as Priority,
      kind: r.kind === 'avoid' ? 'avoid' : 'want',
      group: r.group.trim(),
      notes: r.notes.trim(),
    }));
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new ProviderError('The model did not return JSON.', { hint: 'Try again, or use the offline parser.' });
  }
}

/** Models known to accept the effort setting and server-side refusal fallbacks. */
const MODERN_CLAUDE = /^claude-(opus|sonnet|haiku|fable|mythos)-5/;
const FALLBACK_CLAUDE = /^claude-(opus-5|fable-5|mythos-5|sonnet-5-5)/;

async function viaAnthropic(s: TextProviderSettings, model: string, user: string, signal: AbortSignal): Promise<ParsedRequirement[]> {
  // Loaded on demand: the SDK is only needed for this optional feature.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { base, viaProxy } = await resolveBase('anthropic', s.route, 'https://api.anthropic.com');
  const client = new Anthropic({
    apiKey: s.keys.anthropic ?? '',
    baseURL: base,
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    timeout: 5 * 60 * 1000,
  });
  const useFallback = FALLBACK_CLAUDE.test(model);
  try {
    const response = await client.beta.messages.create(
      {
        model,
        max_tokens: 16000,
        system: SYSTEM,
        messages: [{ role: 'user', content: user }],
        output_config: {
          ...(MODERN_CLAUDE.test(model) ? { effort: 'medium' as const } : {}),
          format: { type: 'json_schema', schema: JSON_SCHEMA as unknown as Record<string, unknown> },
        },
        ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      },
      { signal },
    );
    if (response.stop_reason === 'refusal') {
      throw new ProviderError('The model declined to process these notes.', { hint: 'Use the offline parser instead, or rephrase the notes.' });
    }
    if (response.stop_reason === 'max_tokens') {
      throw new ProviderError('The notes were too long to structure in one go.', { hint: 'Paste them in smaller parts.' });
    }
    const text = response.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return normalize(extractJson(text));
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (e instanceof Anthropic.AuthenticationError)
      throw new ProviderError('The Anthropic API key was rejected.', { status: 401, hint: 'Check the key in Settings.' });
    if (e instanceof Anthropic.PermissionDeniedError) throw new ProviderError('This key is not allowed to use that model.', { status: 403 });
    if (e instanceof Anthropic.NotFoundError)
      throw new ProviderError(`Model “${model}” was not found.`, { status: 404, hint: 'Check the model name in Settings.' });
    if (e instanceof Anthropic.RateLimitError) throw new ProviderError('Rate limit reached.', { status: 429, hint: 'Wait a minute and try again.' });
    if (e instanceof Anthropic.BadRequestError) throw new ProviderError(e.message, { status: 400 });
    if (e instanceof Anthropic.APIConnectionError)
      throw new ProviderError('Could not reach Anthropic.', {
        hint: viaProxy ? 'Check your internet connection.' : 'Check your connection, or run the studio with “npm run dev” to use the local proxy.',
      });
    if (e instanceof Anthropic.APIError) throw new ProviderError(e.message, { status: e.status ?? 0 });
    throw e;
  }
}

async function viaOpenAI(s: TextProviderSettings, model: string, user: string, signal: AbortSignal, compat: boolean): Promise<ParsedRequirement[]> {
  let base: string;
  let viaProxy = false;
  if (compat) {
    base = s.baseUrl.trim().replace(/\/+$/, '');
  } else {
    const r = await resolveBase('openai', s.route, 'https://api.openai.com');
    base = `${r.base}/v1`;
    viaProxy = r.viaProxy;
  }
  const key = s.keys[compat ? 'openai-compatible' : 'openai'] ?? '';
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: `${SYSTEM}\nReply with JSON only: {"requirements": [...]}.` },
      { role: 'user', content: user },
    ],
    response_format: compat ? { type: 'json_object' } : { type: 'json_schema', json_schema: { name: 'requirements', strict: true, schema: JSON_SCHEMA } },
  };
  const res = await providerFetch(
    `${base}/chat/completions`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body), signal },
    compat ? 'The endpoint' : 'OpenAI',
    viaProxy,
  );
  const j = (await res.json()) as { choices?: { message?: { content?: string; refusal?: string } }[] };
  const msg = j.choices?.[0]?.message;
  if (msg?.refusal) throw new ProviderError('The model declined to process these notes.', { hint: 'Use the offline parser instead.' });
  return normalize(extractJson(msg?.content ?? ''));
}

function geminiSchema(): Record<string, unknown> {
  return {
    type: 'OBJECT',
    properties: {
      requirements: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            description: { type: 'STRING' },
            category: { type: 'STRING', enum: CATEGORY_VALUES },
            priority: { type: 'STRING', enum: ['must', 'preferred', 'optional'] },
            kind: { type: 'STRING', enum: ['want', 'avoid'] },
            group: { type: 'STRING' },
            notes: { type: 'STRING' },
          },
          required: ['title', 'description', 'category', 'priority', 'kind', 'group', 'notes'],
        },
      },
    },
    required: ['requirements'],
  };
}

async function viaGemini(s: TextProviderSettings, model: string, user: string, signal: AbortSignal): Promise<ParsedRequirement[]> {
  const { base, viaProxy } = await resolveBase('gemini', s.route, 'https://generativelanguage.googleapis.com');
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: geminiSchema() },
  };
  const res = await providerFetch(
    `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.keys.gemini ?? '' }, body: JSON.stringify(body), signal },
    'Google',
    viaProxy,
  );
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return normalize(extractJson(text));
}

export async function structureWithAI(
  notes: string,
  context: { roomName: string; roomType: string },
  s: TextProviderSettings,
  signal: AbortSignal,
): Promise<ParsedRequirement[]> {
  const p = getTextProvider(s.provider);
  if (!p) throw new ProviderError('No text model is configured.', { hint: 'Set one up in Settings → AI text assistant, or use the offline parser.' });
  const model = (s.models[s.provider] ?? '').trim() || p.defaultModel;
  const user = `Room: ${context.roomName} (${context.roomType})\n\nHomeowner's notes:\n"""\n${notes.trim()}\n"""`;
  switch (p.id) {
    case 'anthropic':
      return viaAnthropic(s, model, user, signal);
    case 'openai':
      return viaOpenAI(s, model, user, signal, false);
    case 'openai-compatible':
      return viaOpenAI(s, model, user, signal, true);
    case 'gemini':
      return viaGemini(s, model, user, signal);
  }
}

export async function testTextProvider(s: TextProviderSettings, signal: AbortSignal): Promise<string> {
  const out = await structureWithAI(
    '- A comfortable reading chair by the window (must)\n- No glossy surfaces',
    { roomName: 'Test room', roomType: 'library' },
    s,
    signal,
  );
  return `Connected. Test produced ${out.length} requirement(s).`;
}
