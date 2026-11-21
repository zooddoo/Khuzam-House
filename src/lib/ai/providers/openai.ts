import type { AspectOption, ImageProviderSettings } from '../../types';
import { base64ToBlob } from '../../images/ingest';
import { ProviderError, providerFetch, resolveBase } from '../http';
import { keyFor, modelFor, type GenerateRequest, type GenerateResult, type ImageProviderDef, type ProviderCapabilities } from './types';

type Family = 'gpt-image' | 'dall-e-3' | 'dall-e-2' | 'unknown';

export function openaiFamily(model: string): Family {
  const m = model.toLowerCase();
  if (m.startsWith('gpt-image') || m.includes('image')) return 'gpt-image';
  if (m.includes('dall-e-3')) return 'dall-e-3';
  if (m.includes('dall-e-2')) return 'dall-e-2';
  return 'unknown';
}

const GPT_IMAGE_SIZES: Record<AspectOption, string> = {
  landscape: '1536x1024',
  wide: '1536x1024',
  square: '1024x1024',
  portrait: '1024x1536',
};
const DALLE3_SIZES: Record<AspectOption, string> = {
  landscape: '1792x1024',
  wide: '1792x1024',
  square: '1024x1024',
  portrait: '1024x1792',
};

function applyOverrides(caps: ProviderCapabilities, s: ImageProviderSettings): ProviderCapabilities {
  const o = s.overrides;
  const imageInput = o.acceptsImages ?? caps.imageInput;
  return {
    ...caps,
    imageInput,
    maxImages: imageInput ? Math.max(1, o.maxImages ?? caps.maxImages) : 0,
  };
}

export function openaiCapabilities(model: string, s: ImageProviderSettings, compat = false): ProviderCapabilities {
  const fam = openaiFamily(model);
  let caps: ProviderCapabilities;
  if (compat) {
    caps = {
      textToImage: true,
      imageInput: false,
      maxImages: 1,
      maxPromptChars: 8000,
      variationsMax: 4,
      quality: false,
      aspects: ['landscape', 'square', 'portrait'],
      requiresBaseImage: false,
      preservation: 'limited',
      notes: [
        'OpenAI-compatible endpoints vary. Image inputs are off unless you enable them under capability overrides.',
        'Requests go directly from the browser to your endpoint; it must allow cross-origin requests.',
      ],
    };
  } else if (fam === 'dall-e-3') {
    caps = {
      textToImage: true,
      imageInput: false,
      maxImages: 0,
      maxPromptChars: 4000,
      variationsMax: 1,
      quality: true,
      aspects: ['landscape', 'square', 'portrait'],
      requiresBaseImage: false,
      preservation: 'none',
      notes: ['DALL·E 3 is text-only: your photos cannot be sent, so results will not match your actual room.'],
    };
  } else if (fam === 'dall-e-2') {
    caps = {
      textToImage: true,
      imageInput: false,
      maxImages: 0,
      maxPromptChars: 1000,
      variationsMax: 4,
      quality: false,
      aspects: ['square'],
      requiresBaseImage: false,
      preservation: 'none',
      notes: ['DALL·E 2 is legacy and text-only here. A gpt-image model is strongly recommended.'],
    };
  } else {
    caps = {
      textToImage: true,
      imageInput: true,
      maxImages: 16,
      maxPromptChars: 32000,
      variationsMax: 4,
      quality: true,
      aspects: ['landscape', 'square', 'portrait'],
      requiresBaseImage: false,
      preservation: 'moderate',
      notes: [
        'Your photos and reference images are sent as real image inputs (Images API “edits”).',
        'The first image is the room photo being redesigned; “high input fidelity” keeps it closer.',
        'Composition is usually kept, but exact architectural preservation is not guaranteed — always review against the real room.',
        'Wide 16:9 is rendered as 3:2 (the widest size this model offers).',
      ],
    };
    if (fam === 'unknown')
      caps.notes.unshift(`“${model}” is not a model this studio recognises; it is treated like gpt-image. Adjust capability overrides if requests fail.`);
  }
  return applyOverrides(caps, s);
}

function extFor(mime: string) {
  return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
}

interface OpenAIImageData {
  b64_json?: string;
  url?: string;
  revised_prompt?: string;
}

async function parseImages(res: Response, mime: string): Promise<{ images: { blob: Blob; mime: string }[]; revised: string | null }> {
  const j = (await res.json()) as { data?: OpenAIImageData[] };
  const data = j.data ?? [];
  const images: { blob: Blob; mime: string }[] = [];
  let revised: string | null = null;
  for (const d of data) {
    if (d.revised_prompt) revised = d.revised_prompt;
    if (d.b64_json) images.push({ blob: base64ToBlob(d.b64_json, mime), mime });
    else if (d.url) {
      const r = await fetch(d.url);
      const blob = await r.blob();
      images.push({ blob, mime: blob.type || mime });
    }
  }
  if (!images.length) throw new ProviderError('The provider returned no image.', { hint: 'Try again, or simplify the request.' });
  return { images, revised };
}

export async function openaiGenerate(
  req: GenerateRequest,
  s: ImageProviderSettings,
  signal: AbortSignal,
  opts: { compat: boolean; label: string },
): Promise<GenerateResult> {
  const key = keyFor(s);
  if (!key && !opts.compat) throw new ProviderError('No API key configured.', { hint: 'Add your OpenAI API key in Settings.' });
  const model = modelFor(s, opts.compat ? '' : 'gpt-image-1');
  if (!model) throw new ProviderError('No model configured.', { hint: 'Enter a model name in Settings.' });
  const fam = openaiFamily(model);
  const caps = openaiCapabilities(model, s, opts.compat);

  let base: string;
  let viaProxy = false;
  if (opts.compat) {
    base = s.baseUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(base))
      throw new ProviderError('The base URL must start with http:// or https://', { hint: 'Example: https://api.example.com/v1' });
  } else {
    const r = await resolveBase('openai', s.route, 'https://api.openai.com');
    base = `${r.base}/v1`;
    viaProxy = r.viaProxy;
  }

  const n = Math.max(1, Math.min(req.variations, caps.variationsMax));
  const size = fam === 'dall-e-3' ? DALLE3_SIZES[req.aspect] : fam === 'dall-e-2' ? '1024x1024' : GPT_IMAGE_SIZES[req.aspect];
  const outFormat = s.options.outputFormat;
  const mime = fam === 'gpt-image' && !opts.compat ? `image/${outFormat === 'jpeg' ? 'jpeg' : outFormat}` : 'image/png';
  const headers: Record<string, string> = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  const prompt = req.prompt.slice(0, caps.maxPromptChars);
  const useImages = caps.imageInput && req.images.length > 0;

  if (useImages) {
    const send = async (withFidelity: boolean) => {
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt);
      form.append('n', String(n));
      form.append('size', size);
      if (!opts.compat) {
        form.append('quality', req.quality);
        form.append('output_format', outFormat);
        if (withFidelity) form.append('input_fidelity', 'high');
      } else {
        form.append('response_format', 'b64_json');
      }
      req.images.slice(0, caps.maxImages).forEach((img, i) => {
        form.append(opts.compat && caps.maxImages === 1 ? 'image' : 'image[]', img.blob, `input-${i + 1}.${extFor(img.mime)}`);
      });
      return providerFetch(`${base}/images/edits`, { method: 'POST', headers, body: form, signal }, opts.label, viaProxy);
    };
    const wantFidelity = !opts.compat && fam === 'gpt-image' && s.options.inputFidelityHigh;
    let res: Response;
    try {
      res = await send(wantFidelity);
    } catch (e) {
      // Some gpt-image variants don't accept input_fidelity — retry once without it.
      if (wantFidelity && e instanceof ProviderError && e.status === 400 && /input_fidelity/i.test(e.message)) res = await send(false);
      else throw e;
    }
    const { images, revised } = await parseImages(res, mime);
    return {
      images,
      model,
      endpoint: `${opts.compat ? base : 'https://api.openai.com/v1'}/images/edits`,
      params: {
        size,
        n,
        quality: opts.compat ? undefined : req.quality,
        input_fidelity: wantFidelity ? 'high' : undefined,
        images: Math.min(req.images.length, caps.maxImages),
      },
      revisedPrompt: revised,
      textResponse: null,
    };
  }

  const body: Record<string, unknown> = { model, prompt, n, size };
  if (fam === 'dall-e-3') {
    body.quality = req.quality === 'high' ? 'hd' : 'standard';
    body.style = 'natural';
    body.response_format = 'b64_json';
  } else if (fam === 'dall-e-2' || opts.compat) {
    body.response_format = 'b64_json';
  } else {
    body.quality = req.quality;
    body.output_format = outFormat;
  }
  const res = await providerFetch(
    `${base}/images/generations`,
    { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal },
    opts.label,
    viaProxy,
  );
  const { images, revised } = await parseImages(res, mime);
  return {
    images,
    model,
    endpoint: `${opts.compat ? base : 'https://api.openai.com/v1'}/images/generations`,
    params: { ...body, model: undefined, prompt: undefined },
    revisedPrompt: revised,
    textResponse: null,
  };
}

export const openaiProvider: ImageProviderDef = {
  id: 'openai',
  label: 'OpenAI Images API',
  description: 'gpt-image models accept up to 16 real reference images per request — the best fit for redesigning a photographed room.',
  keyLabel: 'OpenAI API key',
  keyPlaceholder: 'sk-…',
  keyUrl: 'https://platform.openai.com/api-keys',
  defaultModel: 'gpt-image-1',
  suggestedModels: [
    { id: 'gpt-image-1', note: 'Multi-image edits, high input fidelity' },
    { id: 'gpt-image-1.5', note: 'Newer generation, if your account has it' },
    { id: 'gpt-image-1-mini', note: 'Faster, lower cost' },
    { id: 'dall-e-3', note: 'Text only — cannot use your photos' },
  ],
  needsBaseUrl: false,
  supportsProxy: true,
  capabilities: (model, s) => openaiCapabilities(model, s),
  generate: (req, s, signal) => openaiGenerate(req, s, signal, { compat: false, label: 'OpenAI' }),
  async test(s, signal) {
    const key = keyFor(s);
    if (!key) throw new ProviderError('Enter an API key first.');
    const { base, viaProxy } = await resolveBase('openai', s.route, 'https://api.openai.com');
    const res = await providerFetch(`${base}/v1/models`, { headers: { Authorization: `Bearer ${key}` }, signal }, 'OpenAI', viaProxy);
    const j = (await res.json()) as { data?: { id: string }[] };
    const models = (j.data ?? [])
      .map((m) => m.id)
      .filter((id) => /image|dall-e/i.test(id))
      .sort();
    return { message: `Connected${viaProxy ? ' (via local proxy)' : ''}. ${models.length} image model(s) available to this key.`, models };
  },
};

export const compatProvider: ImageProviderDef = {
  id: 'openai-compatible',
  label: 'OpenAI-compatible endpoint',
  description: 'Any service exposing the OpenAI Images API format at a custom base URL (for example a self-hosted model).',
  keyLabel: 'API key (if required)',
  keyPlaceholder: 'Optional',
  keyUrl: '',
  defaultModel: '',
  suggestedModels: [],
  needsBaseUrl: true,
  supportsProxy: false,
  capabilities: (model, s) => openaiCapabilities(model, s, true),
  generate: (req, s, signal) => openaiGenerate(req, s, signal, { compat: true, label: 'The endpoint' }),
  async test(s, signal) {
    const base = s.baseUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(base)) throw new ProviderError('Enter a base URL starting with http:// or https://');
    const key = keyFor(s);
    const res = await providerFetch(`${base}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal }, 'The endpoint', false);
    const j = (await res.json().catch(() => ({}))) as { data?: { id: string }[] };
    const models = (j.data ?? []).map((m) => m.id);
    return { message: `Endpoint reachable. ${models.length ? `${models.length} model(s) listed.` : 'No model list returned.'}`, models };
  },
};
