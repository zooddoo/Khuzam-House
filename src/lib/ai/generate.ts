import { db } from '../db/db';
import { addReferenceFromBlob } from '../db/references';
import { createVersion } from '../db/versions';
import { snapshotRequirements, snapshotRoom } from '../db/snapshots';
import { updateRoom } from '../db/rooms';
import { updateSettings } from '../db/settings';
import { getDisplayBlob } from '../files/repo';
import { tr } from '../../i18n/messages';
import { prepareForUpload } from '../images/ingest';
import { renderPlanPng } from '../../components/plan/exportPlan';
import type { DesignVersion, GenerationSettings, ImageProviderSettings, Reference, Room, VersionInputImage } from '../types';
import { ProviderError } from './http';
import { activeImageProvider } from './providers/registry';
import type { ImageInput } from './providers/types';
import type { GenerationPackage } from './prompt';

export interface RunInput {
  room: Room;
  pkg: GenerationPackage;
  settings: GenerationSettings;
  imageSettings: ImageProviderSettings;
  references: Reference[];
  signal: AbortSignal;
  onStage?: (stage: string) => void;
}

function inputRecords(pkg: GenerationPackage): VersionInputImage[] {
  return pkg.images.map((p) => ({
    referenceId: p.referenceId,
    imageId: p.imageId,
    role: p.role,
    label: p.label,
    caption: p.caption,
    explanation: p.explanation,
    intent: p.intent,
    requirementId: p.requirementId,
    requirementTitle: p.requirementTitle,
    sent: p.sent,
  }));
}

/**
 * Run one redesign: prepare the selected images (resized, metadata stripped —
 * originals untouched), call the configured provider, and save every
 * returned image as a new version. Never overwrites earlier versions and never
 * produces placeholder images: if the provider fails, nothing is saved.
 */
export async function runGeneration(input: RunInput): Promise<DesignVersion[]> {
  const { room, pkg, settings, imageSettings, signal, onStage } = input;
  const active = activeImageProvider(imageSettings);
  const T = tr().gen;
  if (!active) throw new ProviderError(T.notSetUp, { hint: T.notSetUpHint });
  if (!active.ready) throw new ProviderError(active.problem ?? T.notSetUp, { hint: T.notSetUpHint });
  const blocker = pkg.warnings.find((w) => w.level === 'blocker');
  if (blocker) throw new ProviderError(blocker.message);

  onStage?.(T.preparing);
  const images: ImageInput[] = [];
  const maxEdge = imageSettings.options.maxUploadEdge || 2048;
  for (const p of pkg.images.filter((x) => x.sent).sort((a, b) => a.index - b.index)) {
    if (signal.aborted) throw new ProviderError(T.cancelled, { code: 'aborted' });
    if (p.role === 'layout-plan') {
      const blob = await renderPlanPng(room, 1536, 1024, 'en');
      images.push({ blob, mime: 'image/png', label: p.label, role: p.role });
      continue;
    }
    if (!p.imageId) continue;
    const source = await getDisplayBlob(p.imageId);
    if (!source) throw new ProviderError(tr().studio.imageMissing(p.caption || p.label), { hint: tr().studio.imageMissingHint });
    const blob = await prepareForUpload(source, maxEdge, 'image/jpeg');
    images.push({ blob, mime: 'image/jpeg', label: p.label, role: p.role });
  }

  onStage?.(T.generatingWith(active.provider.label));
  const t0 = performance.now();
  const result = await active.provider.generate(
    { prompt: pkg.prompt, images, aspect: settings.aspect, quality: settings.quality, variations: settings.variations, negativePrompt: pkg.negativePrompt },
    imageSettings,
    signal,
  );
  const durationMs = Math.round(performance.now() - t0);
  if (!result.images.length) throw new ProviderError(T.noImages);

  onStage?.(T.saving);
  const fresh = await db.rooms.get(room.id);
  const roomForSnapshot = fresh ?? room;
  const versions: DesignVersion[] = [];
  for (let i = 0; i < result.images.length; i++) {
    const out = result.images[i];
    const ext = out.mime.includes('jpeg') ? 'jpg' : out.mime.includes('webp') ? 'webp' : 'png';
    const { ref, image } = await addReferenceFromBlob(out.blob, `${room.name}-generated-${Date.now()}-${i + 1}.${ext}`, {
      kind: 'generated',
      origin: 'generated',
      roomIds: [room.id],
      title: `${room.name} concept`,
    });
    const version = await createVersion(room.id, {
      title: '',
      status: 'draft',
      origin: 'generated',
      imageId: image.id,
      referenceId: ref.id,
      prompt: pkg.prompt,
      settings: structuredClone(settings),
      provider: {
        providerId: active.provider.id,
        providerLabel: active.provider.label,
        model: result.model,
        endpoint: result.endpoint,
        params: result.params,
        revisedPrompt: result.revisedPrompt,
        textResponse: result.textResponse,
        durationMs,
      },
      inputImages: inputRecords(pkg),
      requirementsSnapshot: snapshotRequirements(pkg.activeRequirements, input.references),
      roomSnapshot: snapshotRoom(roomForSnapshot),
      doNotChange: pkg.constraints.filter((c) => c.enabled).map((c) => c.text),
      basedOnVersionId: settings.baseVersionId,
      translations: pkg.translationsUsed,
      notes: '',
    });
    await db.references.update(ref.id, { versionIds: [version.id], title: `${room.name} · v${version.number}` });
    versions.push(version);
  }
  await rememberSettings(room.id, settings);
  return versions;
}

/** Save the prompt and settings as a version without an image (no provider call). */
export async function savePromptOnly(room: Room, pkg: GenerationPackage, settings: GenerationSettings, references: Reference[]): Promise<DesignVersion> {
  const v = await createVersion(room.id, {
    title: '',
    status: 'draft',
    origin: 'prompt-only',
    imageId: null,
    referenceId: null,
    prompt: pkg.prompt,
    settings: structuredClone(settings),
    provider: null,
    inputImages: inputRecords(pkg).map((i) => ({ ...i, sent: false })),
    requirementsSnapshot: snapshotRequirements(pkg.activeRequirements, references),
    roomSnapshot: snapshotRoom(room),
    doNotChange: pkg.constraints.filter((c) => c.enabled).map((c) => c.text),
    basedOnVersionId: settings.baseVersionId,
    translations: pkg.translationsUsed,
    notes: tr().gen.promptOnlyNote,
  });
  await rememberSettings(room.id, settings);
  return v;
}

async function rememberSettings(roomId: string, settings: GenerationSettings) {
  await updateRoom(roomId, (d) => void (d.lastGeneration = { ...structuredClone(settings), promptOverride: null, instructions: '', extraConstraints: '' }));
  await updateSettings((s) => void (s.lastStudioRoomId = roomId));
}

/**
 * Save an image made with an outside tool (ChatGPT, Midjourney, a designer…)
 * from this room's prompt as a new version. It keeps the prompt, settings,
 * input images, requirement and dimension snapshots and the Arabic → English
 * wording, and is labelled "Imported" — never "Generated".
 */
export async function importExternalResult(input: {
  room: Room;
  pkg: GenerationPackage;
  settings: GenerationSettings;
  references: Reference[];
  file: File;
  tool: string;
  title: string;
  notes: string;
}): Promise<DesignVersion> {
  const { room, pkg, settings, file } = input;
  const fresh = (await db.rooms.get(room.id)) ?? room;
  const { ref, image } = await addReferenceFromBlob(file, file.name, {
    kind: 'generated',
    origin: 'imported',
    roomIds: [room.id],
    title: input.title || file.name,
  });
  const version = await createVersion(room.id, {
    title: input.title,
    status: 'under-review',
    origin: 'imported',
    imageId: image.id,
    referenceId: ref.id,
    prompt: pkg.prompt,
    settings: structuredClone(settings),
    provider: input.tool.trim()
      ? {
          providerId: 'external',
          providerLabel: input.tool.trim(),
          model: '',
          endpoint: '',
          params: {},
          revisedPrompt: null,
          textResponse: null,
          durationMs: null,
        }
      : null,
    inputImages: inputRecords(pkg).map((i) => ({ ...i, sent: false })),
    requirementsSnapshot: snapshotRequirements(pkg.activeRequirements, input.references),
    roomSnapshot: snapshotRoom(fresh),
    doNotChange: pkg.constraints.filter((c) => c.enabled).map((c) => c.text),
    basedOnVersionId: settings.baseVersionId,
    translations: pkg.translationsUsed,
    notes: input.notes,
  });
  await db.references.update(ref.id, { versionIds: [version.id] });
  await rememberSettings(room.id, settings);
  return version;
}

/** The images of a package, numbered in prompt order, for use in another tool. */
export async function collectPromptImages(room: Room, pkg: GenerationPackage): Promise<{ name: string; blob: Blob }[]> {
  const out: { name: string; blob: Blob }[] = [];
  const list = [...pkg.images].sort((a, b) => a.index - b.index);
  for (const p of list) {
    const label = String(p.index).padStart(2, '0');
    const slug = p.role.replace(/[^a-z-]/g, '');
    if (p.role === 'layout-plan') {
      out.push({ name: `${label}-${slug}.png`, blob: await renderPlanPng(room, 1536, 1024, 'en') });
      continue;
    }
    if (!p.imageId) continue;
    const blob = await getDisplayBlob(p.imageId);
    if (!blob) throw new ProviderError(tr().studio.imageMissing(p.caption || p.label), { hint: tr().studio.imageMissingHint });
    const jpeg = await prepareForUpload(blob, 2048, 'image/jpeg');
    out.push({ name: `${label}-${slug}.jpg`, blob: jpeg });
  }
  return out;
}
