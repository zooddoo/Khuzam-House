import type { AspectOption, ImageProviderId, ImageProviderSettings, ImageRole, QualityOption } from '../../types';

export interface ProviderCapabilities {
  /** Can generate from text alone. */
  textToImage: boolean;
  /** Accepts actual images as inputs (reference / image-to-image). */
  imageInput: boolean;
  /** Maximum number of input images per request. */
  maxImages: number;
  maxPromptChars: number;
  /** Maximum outputs per click (looped where the API returns one image per call). */
  variationsMax: number;
  quality: boolean;
  aspects: AspectOption[];
  /** The API needs a base photo (e.g. structure control). */
  requiresBaseImage: boolean;
  /** How well the model tends to keep the input photo's architecture. Never "exact". */
  preservation: 'strong' | 'moderate' | 'limited' | 'none';
  notes: string[];
}

export interface ImageInput {
  blob: Blob;
  mime: string;
  label: string;
  role: ImageRole;
}

export interface GenerateRequest {
  prompt: string;
  images: ImageInput[];
  aspect: AspectOption;
  quality: QualityOption;
  variations: number;
  negativePrompt: string;
}

export interface GenerateResult {
  images: { blob: Blob; mime: string }[];
  model: string;
  endpoint: string;
  params: Record<string, unknown>;
  revisedPrompt: string | null;
  textResponse: string | null;
}

export interface TestResult {
  message: string;
  models?: string[];
}

export interface ImageProviderDef {
  id: Exclude<ImageProviderId, 'none'>;
  label: string;
  description: string;
  keyLabel: string;
  keyPlaceholder: string;
  keyUrl: string;
  defaultModel: string;
  suggestedModels: { id: string; note: string }[];
  needsBaseUrl: boolean;
  supportsProxy: boolean;
  capabilities(model: string, settings: ImageProviderSettings): ProviderCapabilities;
  generate(req: GenerateRequest, settings: ImageProviderSettings, signal: AbortSignal): Promise<GenerateResult>;
  test(settings: ImageProviderSettings, signal: AbortSignal): Promise<TestResult>;
}

export function keyFor(settings: ImageProviderSettings): string {
  return (settings.keys[settings.provider] ?? '').trim();
}

export function modelFor(settings: ImageProviderSettings, fallback: string): string {
  return (settings.models[settings.provider] ?? '').trim() || fallback;
}
