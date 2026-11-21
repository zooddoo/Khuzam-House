import type { AspectOption, ImageProviderSettings } from '../../types';
import { base64ToBlob, blobToBase64 } from '../../images/ingest';
import { ProviderError, providerFetch, resolveBase } from '../http';
import { keyFor, modelFor, type GenerateRequest, type GenerateResult, type ImageProviderDef, type ProviderCapabilities } from './types';

const RATIO: Record<AspectOption, string> = { landscape: '3:2', wide: '16:9', square: '1:1', portrait: '2:3' };
const IMAGEN_RATIO: Record<AspectOption, string> = { landscape: '4:3', wide: '16:9', square: '1:1', portrait: '3:4' };

const isImagen = (m: string) => m.toLowerCase().startsWith('imagen');
const isProImage = (m: string) => /gemini-3.*pro.*image|pro-image/i.test(m);

export function geminiCapabilities(model: string, s: ImageProviderSettings): ProviderCapabilities {
  let caps: ProviderCapabilities;
  if (isImagen(model)) {
    caps = {
      textToImage: true,
      imageInput: false,
      maxImages: 0,
      maxPromptChars: 1900,
      variationsMax: 4,
      quality: false,
      aspects: ['landscape', 'wide', 'square', 'portrait'],
      requiresBaseImage: false,
      preservation: 'none',
      notes: ['Imagen is text-only through this API: photos cannot be sent, and prompts are short, so the prompt is condensed.'],
    };
  } else {
    const pro = isProImage(model);
    caps = {
      textToImage: true,
      imageInput: true,
      maxImages: pro ? 14 : 3,
      maxPromptChars: 30000,
      variationsMax: 4,
      quality: false,
      aspects: ['landscape', 'wide', 'square', 'portrait'],
      requiresBaseImage: false,
      preservation: 'moderate',
      notes: [
        'Images are sent inline, each preceded by its own label and caption, so the model knows which requirement each image belongs to.',
        pro
          ? 'Supports many reference images per request.'
          : 'Google recommends up to 3 input images for this model; raise the limit under capability overrides if you want to try more.',
        'Composition is usually kept, but exact architectural preservation is not guaranteed — always review against the real room.',
      ],
    };
  }
  const o = s.overrides;
  const imageInput = o.acceptsImages ?? caps.imageInput;
  return { ...caps, imageInput, maxImages: imageInput ? Math.max(1, o.maxImages ?? caps.maxImages) : 0 };
}

interface Part {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  inline_data?: { mime_type: string; data: string };
}

export const geminiProvider: ImageProviderDef = {
  id: 'gemini',
  label: 'Google Gemini API',
  description: 'Gemini image models take your photos and reference images interleaved with their captions. Imagen models are text-only.',
  keyLabel: 'Gemini API key',
  keyPlaceholder: 'AIza…',
  keyUrl: 'https://aistudio.google.com/apikey',
  defaultModel: 'gemini-2.5-flash-image',
  suggestedModels: [
    { id: 'gemini-2.5-flash-image', note: 'Image editing with references (best with ≤ 3 images)' },
    { id: 'gemini-3-pro-image-preview', note: 'Higher quality, many reference images (if available)' },
    { id: 'imagen-4.0-generate-001', note: 'Text only — cannot use your photos' },
  ],
  needsBaseUrl: false,
  supportsProxy: true,
  capabilities: geminiCapabilities,

  async generate(req: GenerateRequest, s: ImageProviderSettings, signal: AbortSignal): Promise<GenerateResult> {
    const key = keyFor(s);
    if (!key) throw new ProviderError('No API key configured.', { hint: 'Add your Gemini API key in Settings.' });
    const model = modelFor(s, 'gemini-2.5-flash-image');
    const caps = geminiCapabilities(model, s);
    const { base, viaProxy } = await resolveBase('gemini', s.route, 'https://generativelanguage.googleapis.com');
    const headers = { 'x-goog-api-key': key, 'Content-Type': 'application/json' };
    const n = Math.max(1, Math.min(req.variations, caps.variationsMax));

    if (isImagen(model)) {
      const body = {
        instances: [{ prompt: req.prompt.slice(0, caps.maxPromptChars) }],
        parameters: { sampleCount: n, aspectRatio: IMAGEN_RATIO[req.aspect] },
      };
      const res = await providerFetch(
        `${base}/v1beta/models/${encodeURIComponent(model)}:predict`,
        { method: 'POST', headers, body: JSON.stringify(body), signal },
        'Google',
        viaProxy,
      );
      const j = (await res.json()) as { predictions?: { bytesBase64Encoded?: string; mimeType?: string }[] };
      const images = (j.predictions ?? [])
        .filter((p) => p.bytesBase64Encoded)
        .map((p) => ({ blob: base64ToBlob(p.bytesBase64Encoded!, p.mimeType ?? 'image/png'), mime: p.mimeType ?? 'image/png' }));
      if (!images.length) throw new ProviderError('No image was returned (it may have been filtered).', { hint: 'Try rephrasing the instructions.' });
      return { images, model, endpoint: `models/${model}:predict`, params: body.parameters, revisedPrompt: null, textResponse: null };
    }

    const parts: Part[] = [{ text: req.prompt.slice(0, caps.maxPromptChars) }];
    const sent = caps.imageInput ? req.images.slice(0, caps.maxImages) : [];
    for (let i = 0; i < sent.length; i++) {
      parts.push({ text: `Image ${i + 1} — ${sent[i].label}` });
      parts.push({ inlineData: { mimeType: sent[i].mime, data: await blobToBase64(sent[i].blob) } });
    }
    parts.push({ text: 'Now produce the single redesigned image, following every instruction above.' });

    const imageConfig: Record<string, string> = { aspectRatio: RATIO[req.aspect] };
    if (s.options.geminiImageSize && isProImage(model)) imageConfig.imageSize = s.options.geminiImageSize;
    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig },
    };

    const images: { blob: Blob; mime: string }[] = [];
    let textResponse: string | null = null;
    for (let k = 0; k < n; k++) {
      const res = await providerFetch(
        `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { method: 'POST', headers, body: JSON.stringify(body), signal },
        'Google',
        viaProxy,
      );
      const j = (await res.json()) as {
        candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
        promptFeedback?: { blockReason?: string };
      };
      const cand = j.candidates?.[0];
      const outParts = cand?.content?.parts ?? [];
      let got = false;
      for (const p of outParts) {
        const inline = p.inlineData ?? (p.inline_data ? { mimeType: p.inline_data.mime_type, data: p.inline_data.data } : undefined);
        if (inline?.data) {
          images.push({ blob: base64ToBlob(inline.data, inline.mimeType || 'image/png'), mime: inline.mimeType || 'image/png' });
          got = true;
        } else if (p.text) {
          textResponse = (textResponse ? `${textResponse}\n` : '') + p.text;
        }
      }
      if (!got) {
        const reason = j.promptFeedback?.blockReason || cand?.finishReason || 'no image in response';
        if (images.length) break;
        throw new ProviderError(`Google returned no image (${reason}).${textResponse ? ` Model said: ${textResponse.slice(0, 300)}` : ''}`, {
          hint: /safety|prohibited|blocked|recitation/i.test(reason)
            ? "Google's safety filters blocked the result. Try photos without people and plainer instructions."
            : 'Try again — image models occasionally reply with text only. Simplifying the instructions can help.',
        });
      }
    }
    return {
      images,
      model,
      endpoint: `models/${model}:generateContent`,
      params: { ...imageConfig, images: sent.length, variations: n },
      revisedPrompt: null,
      textResponse,
    };
  },

  async test(s, signal) {
    const key = keyFor(s);
    if (!key) throw new ProviderError('Enter an API key first.');
    const { base, viaProxy } = await resolveBase('gemini', s.route, 'https://generativelanguage.googleapis.com');
    const res = await providerFetch(`${base}/v1beta/models?pageSize=200`, { headers: { 'x-goog-api-key': key }, signal }, 'Google', viaProxy);
    const j = (await res.json()) as { models?: { name: string }[] };
    const models = (j.models ?? [])
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((id) => /image|imagen/i.test(id))
      .sort();
    return { message: `Connected${viaProxy ? ' (via local proxy)' : ''}. ${models.length} image model(s) available.`, models };
  },
};
