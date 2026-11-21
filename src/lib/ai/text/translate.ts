import { z } from 'zod';
import type { TextProviderSettings } from '../../types';
import { ProviderError, providerFetch, resolveBase } from '../http';
import { getTextProvider } from './structure';
import { tr } from '../../../i18n/messages';

/**
 * Optional automatic Arabic → English translation of texts used in design
 * prompts, through the independently configured AI text assistant. The
 * owner always reviews the result; without a text assistant the English is
 * typed by hand.
 */

const SYSTEM = [
  'You translate short Arabic texts written by a homeowner about the interior design of their house in Riyadh into clear, natural English.',
  'They will be used inside an English prompt for an image-generation model.',
  'Rules:',
  '- Translate meaning faithfully. Do not add, remove or embellish details, measurements, products or preferences.',
  '- Keep measurements and numbers exactly (convert Arabic-Indic digits to 0-9).',
  '- Use common interior-design vocabulary (e.g. مجلس → majlis, جلسة أرضية → floor seating).',
  '- Keep any English words already present.',
  '- Return exactly one translation per input, in the same order, with the same index.',
].join('\n');

const SCHEMA = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: { i: { type: 'integer' }, en: { type: 'string' } },
        required: ['i', 'en'],
        additionalProperties: false,
      },
    },
  },
  required: ['translations'],
  additionalProperties: false,
} as const;

const resultSchema = z.object({ translations: z.array(z.object({ i: z.number(), en: z.string() })) });

function parse(text: string, count: number): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    const a = text.indexOf('{');
    const b = text.lastIndexOf('}');
    if (a < 0 || b <= a) throw new ProviderError(tr().translate.failed('no JSON'));
    raw = JSON.parse(text.slice(a, b + 1));
  }
  const r = resultSchema.safeParse(raw);
  if (!r.success) throw new ProviderError(tr().translate.failed('unexpected format'));
  const out: string[] = new Array(count).fill('');
  for (const t of r.data.translations) if (t.i >= 0 && t.i < count) out[t.i] = t.en.trim();
  return out;
}

const MODERN_CLAUDE = /^claude-(opus|sonnet|haiku|fable|mythos)-5/;
const FALLBACK_CLAUDE = /^claude-(opus-5|fable-5|mythos-5|sonnet-5-5)/;

export async function translateToEnglish(texts: string[], s: TextProviderSettings, signal: AbortSignal): Promise<string[]> {
  const p = getTextProvider(s.provider);
  if (!p) throw new ProviderError(tr().translate.noProvider);
  if (!texts.length) return [];
  const model = (s.models[s.provider] ?? '').trim() || p.defaultModel;
  const user = `Translate these ${texts.length} texts to English. Reply with JSON {"translations": [{"i": index, "en": "..."}]}.\n\n${JSON.stringify(
    texts.map((text, i) => ({ i, text })),
  )}`;

  if (p.id === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const { base } = await resolveBase('anthropic', s.route, 'https://api.anthropic.com');
    const client = new Anthropic({ apiKey: s.keys.anthropic ?? '', baseURL: base, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 5 * 60 * 1000 });
    try {
      const response = await client.beta.messages.create(
        {
          model,
          max_tokens: 16000,
          system: SYSTEM,
          messages: [{ role: 'user', content: user }],
          output_config: {
            ...(MODERN_CLAUDE.test(model) ? { effort: 'low' as const } : {}),
            format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> },
          },
          ...(FALLBACK_CLAUDE.test(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        },
        { signal },
      );
      if (response.stop_reason === 'refusal') throw new ProviderError(tr().translate.failed('the model declined'));
      const text = response.content
        .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return parse(text, texts.length);
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (e instanceof Anthropic.APIError) throw new ProviderError(tr().translate.failed(e.message), { status: e.status ?? 0 });
      throw e;
    }
  }

  if (p.id === 'gemini') {
    const { base, viaProxy } = await resolveBase('gemini', s.route, 'https://generativelanguage.googleapis.com');
    const res = await providerFetch(
      `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.keys.gemini ?? '' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal,
      },
      'Google',
      viaProxy,
    );
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return parse(j.candidates?.[0]?.content?.parts?.map((x) => x.text ?? '').join('') ?? '', texts.length);
  }

  const compat = p.id === 'openai-compatible';
  let base: string;
  let viaProxy = false;
  if (compat) base = s.baseUrl.trim().replace(/\/+$/, '');
  else {
    const r = await resolveBase('openai', s.route, 'https://api.openai.com');
    base = `${r.base}/v1`;
    viaProxy = r.viaProxy;
  }
  const key = s.keys[compat ? 'openai-compatible' : 'openai'] ?? '';
  const res = await providerFetch(
    `${base}/chat/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
        response_format: compat ? { type: 'json_object' } : { type: 'json_schema', json_schema: { name: 'translations', strict: true, schema: SCHEMA } },
      }),
      signal,
    },
    compat ? 'The endpoint' : 'OpenAI',
    viaProxy,
  );
  const j = (await res.json()) as { choices?: { message?: { content?: string; refusal?: string } }[] };
  const msg = j.choices?.[0]?.message;
  if (msg?.refusal) throw new ProviderError(tr().translate.failed('the model declined'));
  return parse(msg?.content ?? '', texts.length);
}
