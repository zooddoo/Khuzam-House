import type { ImageProviderId, ImageProviderSettings } from '../../types';
import { compatProvider, openaiProvider } from './openai';
import { geminiProvider } from './gemini';
import { stabilityProvider } from './stability';
import { keyFor, modelFor, type ImageProviderDef, type ProviderCapabilities } from './types';

export const IMAGE_PROVIDERS: ImageProviderDef[] = [openaiProvider, geminiProvider, stabilityProvider, compatProvider];

export function getImageProvider(id: ImageProviderId): ImageProviderDef | null {
  return IMAGE_PROVIDERS.find((p) => p.id === id) ?? null;
}

export interface ActiveImageProvider {
  provider: ImageProviderDef;
  model: string;
  capabilities: ProviderCapabilities;
  ready: boolean;
  /** Why generation can't run yet, if not ready. */
  problem: string | null;
}

export function activeImageProvider(s: ImageProviderSettings): ActiveImageProvider | null {
  const provider = getImageProvider(s.provider);
  if (!provider) return null;
  const model = modelFor(s, provider.defaultModel);
  const capabilities = provider.capabilities(model, s);
  let problem: string | null = null;
  if (provider.needsBaseUrl && !/^https?:\/\//.test(s.baseUrl.trim())) problem = 'Enter the endpoint base URL in Settings.';
  else if (!provider.needsBaseUrl && !keyFor(s)) problem = `Enter your ${provider.keyLabel} in Settings.`;
  else if (!model) problem = 'Enter a model name in Settings.';
  return { provider, model, capabilities, ready: !problem, problem };
}

export function imageProviderSummary(s: ImageProviderSettings): { configured: boolean; label: string } {
  const a = activeImageProvider(s);
  if (!a) return { configured: false, label: 'No provider selected' };
  return { configured: a.ready, label: a.ready ? `${a.provider.label} · ${a.model}` : (a.problem ?? a.provider.label) };
}
