import type { AspectOption, ImageProviderSettings } from '../../types';
import { ProviderError, providerFetch, resolveBase } from '../http';
import { keyFor, modelFor, type GenerateRequest, type GenerateResult, type ImageProviderDef, type ProviderCapabilities } from './types';

const RATIO: Record<AspectOption, string> = { landscape: '3:2', wide: '16:9', square: '1:1', portrait: '2:3' };

type Mode = 'structure' | 'sd3' | 'ultra' | 'core';

function modeFor(model: string): Mode {
  const m = model.toLowerCase();
  if (m.includes('structure') || m.includes('control')) return 'structure';
  if (m.startsWith('sd3')) return 'sd3';
  if (m.includes('core')) return 'core';
  return 'ultra';
}

export function stabilityCapabilities(model: string, s: ImageProviderSettings): ProviderCapabilities {
  const mode = modeFor(model);
  const caps: ProviderCapabilities =
    mode === 'structure'
      ? {
          textToImage: false,
          imageInput: true,
          maxImages: 1,
          maxPromptChars: 10000,
          variationsMax: 4,
          quality: false,
          aspects: [],
          requiresBaseImage: true,
          preservation: 'strong',
          notes: [
            'Structure control keeps the lines and layout of your room photo while restyling it — the strongest architectural preservation available here.',
            'Only one image (the room photo) can be sent; other references are described in text.',
            'The output keeps the aspect ratio of the photo.',
          ],
        }
      : mode === 'sd3'
        ? {
            textToImage: true,
            imageInput: true,
            maxImages: 1,
            maxPromptChars: 10000,
            variationsMax: 4,
            quality: false,
            aspects: ['landscape', 'wide', 'square', 'portrait'],
            requiresBaseImage: false,
            preservation: 'limited',
            notes: ['Image-to-image from the room photo; other references are described in text. Architecture can drift — review carefully.'],
          }
        : {
            textToImage: true,
            imageInput: false,
            maxImages: 0,
            maxPromptChars: 10000,
            variationsMax: 4,
            quality: false,
            aspects: ['landscape', 'wide', 'square', 'portrait'],
            requiresBaseImage: false,
            preservation: 'none',
            notes: ['Text-to-image only: your photos are not used, so results will not match your actual room.'],
          };
  const o = s.overrides;
  const imageInput = mode === 'structure' ? true : (o.acceptsImages ?? caps.imageInput);
  return { ...caps, imageInput, maxImages: imageInput ? 1 : 0 };
}

export const stabilityProvider: ImageProviderDef = {
  id: 'stability',
  label: 'Stability AI',
  description: '“Structure control” restyles your actual room photo while keeping its structure. Accepts one input image.',
  keyLabel: 'Stability API key',
  keyPlaceholder: 'sk-…',
  keyUrl: 'https://platform.stability.ai/account/keys',
  defaultModel: 'control-structure',
  suggestedModels: [
    { id: 'control-structure', note: 'Keeps the structure of your room photo (needs a photo)' },
    { id: 'sd3.5-large', note: 'Image-to-image or text-to-image' },
    { id: 'ultra', note: 'Text only' },
    { id: 'core', note: 'Text only, faster' },
  ],
  needsBaseUrl: false,
  supportsProxy: true,
  capabilities: stabilityCapabilities,

  async generate(req: GenerateRequest, s: ImageProviderSettings, signal: AbortSignal): Promise<GenerateResult> {
    const key = keyFor(s);
    if (!key) throw new ProviderError('No API key configured.', { hint: 'Add your Stability API key in Settings.' });
    const model = modelFor(s, 'control-structure');
    const mode = modeFor(model);
    const caps = stabilityCapabilities(model, s);
    const { base, viaProxy } = await resolveBase('stability', s.route, 'https://api.stability.ai');
    const photo = req.images[0];
    if (mode === 'structure' && !photo)
      throw new ProviderError('Structure control needs a room photo.', { hint: 'Choose a site photo as “Photo to redesign”.' });
    const fmt = s.options.outputFormat;
    const n = Math.max(1, Math.min(req.variations, caps.variationsMax));
    const images: { blob: Blob; mime: string }[] = [];
    let endpoint = '';
    let params: Record<string, unknown> = {};

    for (let k = 0; k < n; k++) {
      const form = new FormData();
      form.append('prompt', req.prompt.slice(0, caps.maxPromptChars));
      if (req.negativePrompt) form.append('negative_prompt', req.negativePrompt.slice(0, 2000));
      form.append('output_format', fmt);
      if (mode === 'structure') {
        endpoint = '/v2beta/stable-image/control/structure';
        form.append('image', photo.blob, 'room.jpg');
        form.append('control_strength', String(s.options.controlStrength));
        params = { control_strength: s.options.controlStrength };
      } else if (mode === 'sd3') {
        endpoint = '/v2beta/stable-image/generate/sd3';
        form.append('model', model);
        if (photo && caps.imageInput) {
          form.append('mode', 'image-to-image');
          form.append('image', photo.blob, 'room.jpg');
          form.append('strength', String(s.options.imageStrength));
          params = { model, mode: 'image-to-image', strength: s.options.imageStrength };
        } else {
          form.append('mode', 'text-to-image');
          form.append('aspect_ratio', RATIO[req.aspect]);
          params = { model, mode: 'text-to-image', aspect_ratio: RATIO[req.aspect] };
        }
      } else {
        endpoint = mode === 'core' ? '/v2beta/stable-image/generate/core' : '/v2beta/stable-image/generate/ultra';
        form.append('aspect_ratio', RATIO[req.aspect]);
        params = { aspect_ratio: RATIO[req.aspect] };
      }
      const res = await providerFetch(
        `${base}${endpoint}`,
        { method: 'POST', headers: { Authorization: `Bearer ${key}`, Accept: 'image/*' }, body: form, signal },
        'Stability AI',
        viaProxy,
      );
      if ((res.headers.get('finish-reason') ?? '').toUpperCase() === 'CONTENT_FILTERED') {
        throw new ProviderError('Stability AI filtered the result.', { hint: 'Try a photo without people and simpler instructions.' });
      }
      const blob = await res.blob();
      images.push({ blob, mime: blob.type || `image/${fmt}` });
    }
    return { images, model, endpoint: `https://api.stability.ai${endpoint}`, params, revisedPrompt: null, textResponse: null };
  },

  async test(s, signal) {
    const key = keyFor(s);
    if (!key) throw new ProviderError('Enter an API key first.');
    const { base, viaProxy } = await resolveBase('stability', s.route, 'https://api.stability.ai');
    const res = await providerFetch(`${base}/v1/user/balance`, { headers: { Authorization: `Bearer ${key}` }, signal }, 'Stability AI', viaProxy);
    const j = (await res.json().catch(() => ({}))) as { credits?: number };
    return {
      message: `Connected${viaProxy ? ' (via local proxy)' : ''}.${typeof j.credits === 'number' ? ` ${j.credits.toFixed(1)} credits available.` : ''}`,
    };
  },
};
