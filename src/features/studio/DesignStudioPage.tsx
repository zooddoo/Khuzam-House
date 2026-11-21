import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowRight, Sparkles } from 'lucide-react';
import { zipSync, strToU8 } from 'fflate';
import { toast } from 'sonner';
import type { GenerationSettings, ID } from '@/lib/types';
import { useFloors, useLibrary, useProject, useRequirements, useRoom, useRoomReferences, useRooms, useSettings, useTranslations, useVersions } from '@/lib/hooks/data';
import { buildGenerationPackage, defaultImageSelection } from '@/lib/ai/prompt';
import { activeImageProvider } from '@/lib/ai/providers/registry';
import { jobStore, useGenerationJob } from '@/lib/ai/jobs';
import { collectPromptImages, runGeneration, savePromptOnly } from '@/lib/ai/generate';
import { describeError, ProviderError } from '@/lib/ai/http';
import { defaultGenerationSettings } from '@/lib/db/factories';
import { computeRoomShape, dimensionSummary } from '@/lib/geometry/room';
import { roomTypeLabel } from '@/lib/labels';
import { roomDisplayName } from '@/lib/names';
import { downloadBlob, safeFilename } from '@/lib/download';
import { useT } from '@/i18n';
import { useUploadReferences } from '@/components/images/useUpload';
import { ButtonLink } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/Form';
import { EmptyState, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { EnglishField } from '@/components/translate/EnglishField';
import { RoomCover, RoomStatusLabel } from '../rooms/shared';
import { VersionDetail } from '../versions/VersionDetail';
import { BaseChooser, ConstraintList, DirectionSummary, ExtraImages, RenderSettings, RequirementPicker, RoomCheck, StudioSection } from './StudioSections';
import { StudioPanel } from './StudioPanel';
import { TranslationsSection } from './TranslationsSection';
import { ImportResultDialog } from './ImportResultDialog';

export function DesignStudioPage() {
  const { roomId } = useParams();
  const [params] = useSearchParams();
  if (!roomId) return <StudioRoomPicker />;
  return <StudioForRoom key={`${roomId}-${params.get('from') ?? ''}`} roomId={roomId} fromVersionId={params.get('from')} />;
}

function StudioRoomPicker() {
  const rooms = useRooms();
  const settings = useSettings();
  const t = useT();
  const T = t.studio;
  const last = rooms?.find((r) => r.id === settings?.lastStudioRoomId);
  if (!rooms) return <LoadingBlock />;
  return (
    <div>
      <PageHeader
        eyebrow={T.eyebrow}
        title={T.title}
        description={T.pickerLead}
      />
      {last && (
        <Link
          to={`/studio/${last.id}`}
          className="mb-10 flex items-center gap-4 rounded-md border border-line bg-surface p-4 transition-shadow hover:shadow-soft"
        >
          <div className="w-28 shrink-0 overflow-hidden rounded-sm sm:w-40">
            <RoomCover room={last} className="aspect-[3/2]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="eyebrow">{T.continueLast}</div>
            <div className="display mt-1 truncate text-[24px] sm:text-[28px]">{roomDisplayName(last)}</div>
          </div>
          <ArrowRight size={18} className="flip-rtl shrink-0 text-ink-3" />
        </Link>
      )}
      {rooms.length === 0 ? (
        <EmptyState
          title={t.rooms.emptyTitle}
          action={
            <ButtonLink to="/rooms?new=1" variant="primary">
              {t.rooms.add}
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room) => {
            const drawable = computeRoomShape(room).drawable;
            return (
              <Link
                key={room.id}
                to={`/studio/${room.id}`}
                className="group overflow-hidden rounded-md border border-line bg-surface transition-shadow hover:shadow-soft"
              >
                <RoomCover room={room} className="aspect-[16/9]" />
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="display truncate text-[24px] group-hover:text-accent">{roomDisplayName(room)}</div>
                    <div className="mt-1 text-[12px] text-ink-3">
                      {roomTypeLabel(room.type)} · {drawable ? dimensionSummary(room) : T.dimensionsUnknown}
                    </div>
                  </div>
                  <RoomStatusLabel status={room.status} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StudioForRoom({ roomId, fromVersionId }: { roomId: ID; fromVersionId: string | null }) {
  const navigate = useNavigate();
  const t = useT();
  const T = t.studio;
  const project = useProject();
  const room = useRoom(roomId);
  const rooms = useRooms() ?? [];
  const floors = useFloors() ?? [];
  const requirements = useRequirements(roomId);
  const references = useRoomReferences(roomId);
  const versions = useVersions(roomId);
  const library = useLibrary() ?? [];
  const settings = useSettings();
  const translations = useTranslations();
  const job = useGenerationJob(roomId);
  const { upload, busy: uploading } = useUploadReferences();
  const [gen, setGen] = useState<GenerationSettings | null>(null);
  const [excluded, setExcluded] = useState<ID[]>([]);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [openVersion, setOpenVersion] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !room || !requirements || !references || !versions) return;
    initialized.current = true;
    const sel = defaultImageSelection(room, requirements, references);
    const remembered = room.lastGeneration;
    let next: GenerationSettings = {
      ...defaultGenerationSettings(),
      ...(remembered ?? {}),
      baseReferenceId:
        remembered?.baseReferenceId && references.some((r) => r.id === remembered.baseReferenceId) ? remembered.baseReferenceId : sel.baseReferenceId,
      baseVersionId: null,
      includedReferenceIds: sel.includedReferenceIds,
      includedRequirementIds: [],
      instructions: '',
      extraConstraints: '',
      directionOverride: '',
      disabledConstraintKeys: [],
      promptOverride: null,
    };
    if (next.baseReferenceId) next.includedReferenceIds = next.includedReferenceIds.filter((id) => id !== next.baseReferenceId);
    if (fromVersionId) {
      const v = versions.find((x) => x.id === fromVersionId);
      if (v?.imageId) {
        next = {
          ...next,
          ...(v.settings
            ? {
                timeOfDay: v.settings.timeOfDay,
                lens: v.settings.lens,
                realism: v.settings.realism,
                aspect: v.settings.aspect,
                quality: v.settings.quality,
                prioritize: v.settings.prioritize,
                avoid: v.settings.avoid,
              }
            : {}),
          baseVersionId: v.id,
          cameraAngle: 'match-photo',
        };
      }
    }
    setGen(next);
  }, [room, requirements, references, versions, fromVersionId]);

  const active = settings ? activeImageProvider(settings.imageProvider) : null;
  const baseVersion = gen?.baseVersionId ? ((versions ?? []).find((v) => v.id === gen.baseVersionId) ?? null) : null;
  const includedReqs = useMemo(() => (requirements ?? []).filter((r) => r.status !== 'rejected' && !excluded.includes(r.id)), [requirements, excluded]);

  const ctxSettings = useMemo<GenerationSettings | null>(
    () => (gen ? { ...gen, includedRequirementIds: includedReqs.map((r) => r.id), promptOverride: null } : null),
    [gen, includedReqs],
  );

  const basePkg = useMemo(() => {
    if (!room || !ctxSettings || !references || !settings || !translations) return null;
    return buildGenerationPackage({
      projectName: project?.name || 'Bait Khuzam',
      location: project?.location || 'Riyadh, Saudi Arabia',
      room,
      floorName: floors.find((f) => f.id === room.floorId)?.name || null,
      requirements: includedReqs,
      references,
      libraryItems: library,
      baseVersion,
      settings: ctxSettings,
      capabilities: active?.ready ? active.capabilities : null,
      houseGuidelines: settings.houseGuidelines,
      translations,
    });
  }, [room, ctxSettings, references, settings, translations, project, floors, includedReqs, library, baseVersion, active?.ready, active?.capabilities]);

  const pkg = useMemo(() => {
    if (!basePkg) return null;
    if (promptOverride === null) return basePkg;
    return { ...basePkg, prompt: promptOverride, warnings: [...basePkg.warnings, { level: 'info' as const, message: T.usingEdited }] };
  }, [basePkg, promptOverride, T]);

  if (room === null) return <EmptyState title={t.room.notFound} action={<ButtonLink to="/studio">{T.chooseAnother}</ButtonLink>} />;
  if (!room || !gen || !pkg || !requirements || !references || !versions || !settings) return <LoadingBlock label={T.assembling} />;
  const roomName = roomDisplayName(room);

  const set = (patch: Partial<GenerationSettings>) => setGen((g) => (g ? { ...g, ...patch } : g));
  const sitePhotos = references.filter((r) => r.kind === 'site-photo' && r.roomIds.includes(room.id) && r.requirementIds.length === 0);
  const reqImageIds = new Set(references.filter((r) => r.requirementIds.some((id) => requirements.some((q) => q.id === id))).map((r) => r.id));
  const extraCandidates = references.filter((r) => !reqImageIds.has(r.id) && r.kind !== 'generated');

  const toggleRequirement = (id: ID, on: boolean) => {
    setExcluded((ex) => (on ? ex.filter((x) => x !== id) : [...ex, id]));
    const imgs = references.filter((r) => r.requirementIds.includes(id)).map((r) => r.id);
    set({
      includedReferenceIds: on
        ? [...gen.includedReferenceIds, ...imgs.filter((x) => !gen.includedReferenceIds.includes(x))]
        : gen.includedReferenceIds.filter((x) => !imgs.includes(x)),
    });
  };
  const toggleImage = (id: ID, on: boolean) =>
    set({ includedReferenceIds: on ? [...gen.includedReferenceIds, id] : gen.includedReferenceIds.filter((x) => x !== id) });
  const moveImage = (key: string, dir: -1 | 1) => {
    const ids = [...gen.includedReferenceIds];
    const i = ids.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    set({ includedReferenceIds: ids });
  };

  const finalSettings = (): GenerationSettings => ({ ...gen, includedRequirementIds: includedReqs.map((r) => r.id), promptOverride });

  const generate = async () => {
    if (jobStore.get(room.id)?.status === 'running') return;
    const j = jobStore.start(room.id);
    try {
      const created = await runGeneration({
        room,
        pkg,
        settings: finalSettings(),
        imageSettings: settings.imageProvider,
        references,
        signal: j.controller.signal,
        onStage: (stage) => jobStore.update(room.id, { stage }),
      });
      jobStore.update(room.id, { status: 'done', versionIds: created.map((v) => v.id) });
      toast.success(T.generatedSaved(roomName, created.length, created[0].number), {
        action: { label: t.common.view, onClick: () => setOpenVersion(created[0].id) },
      });
    } catch (e) {
      const aborted =
        (e instanceof ProviderError && e.code === 'aborted') || (e instanceof DOMException && e.name === 'AbortError') || j.controller.signal.aborted;
      jobStore.update(room.id, aborted ? { status: 'cancelled' } : { status: 'error', error: describeError(e) });
      if (!aborted) toast.error(T.generationFailed, { description: describeError(e).message });
    }
  };

  const promptOnly = async () => {
    const v = await savePromptOnly(room, pkg, finalSettings(), references);
    toast.success(T.promptOnlySaved(v.number), { description: T.noImageGenerated });
  };

  const promptFileText = () =>
    [
      pkg.prompt,
      '',
      '---',
      pkg.negativePrompt ? `Negative prompt / avoid: ${pkg.negativePrompt}` : '',
      `Images (attach in this order):`,
      ...[...pkg.images].sort((a, b) => a.index - b.index).map((p) => `${p.index}. ${p.label}${p.caption ? ` — ${p.caption}` : ''}`),
    ]
      .filter((l) => l !== null)
      .join('\n');

  const prepareImages = async () => {
    setPreparing(true);
    try {
      return await collectPromptImages(room, pkg);
    } catch (e) {
      toast.error(T.imagesFailed, { description: describeError(e).message });
      return null;
    } finally {
      setPreparing(false);
    }
  };

  const downloadImages = async () => {
    const imgs = await prepareImages();
    if (!imgs) return;
    const entries: Record<string, Uint8Array> = { 'prompt.txt': strToU8(promptFileText()) };
    for (const i of imgs) entries[i.name] = new Uint8Array(await i.blob.arrayBuffer());
    const zip = zipSync(entries, { level: 0 });
    downloadBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), `${safeFilename(room.name || 'room')}-design-images.zip`);
    toast.success(T.imagesDownloaded(imgs.length));
  };

  const canShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';
  const shareImages = async () => {
    const imgs = await prepareImages();
    if (!imgs) return;
    const files = imgs.map((i) => new File([i.blob], i.name, { type: i.blob.type || 'image/jpeg' }));
    const data: ShareData = { text: pkg.prompt, files };
    try {
      if (!navigator.canShare(data)) {
        toast.error(T.shareUnsupported);
        return;
      }
      await navigator.share(data);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      toast.error(T.shareUnsupported, { description: describeError(e).message });
    }
  };

  const openV = versions.find((v) => v.id === openVersion) ?? null;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="eyebrow mb-2 flex items-center gap-1.5">
            <Sparkles size={12} /> {T.title}
          </div>
          <h1 className="display text-[36px] sm:text-[52px]">{T.redesignRoom(roomName)}</h1>
          <p className="mt-2 max-w-[680px] text-[13px] leading-relaxed text-ink-3">{T.roomLead}</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Select value={room.id} onChange={(e) => navigate(`/studio/${e.target.value}`)} className="min-w-0 flex-1 sm:w-[220px]" aria-label={T.switchRoom}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {roomDisplayName(r)}
              </option>
            ))}
          </Select>
          <ButtonLink to={`/rooms/${room.id}/overview`}>{T.openRoom}</ButtonLink>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-8">
          {(pkg.untranslated.length > 0 || pkg.translationsUsed.length > 0) && (
            <TranslationsSection untranslated={pkg.untranslated} used={pkg.translationsUsed} textProvider={settings.textProvider} />
          )}
          <StudioSection n={1} title={T.s1} description={T.s1Lead}>
            <RoomCheck room={room} sitePhotoCount={sitePhotos.length} />
          </StudioSection>

          <StudioSection
            n={2}
            title={T.s2}
            description={T.s2Lead}
          >
            <BaseChooser
              sitePhotos={sitePhotos}
              baseVersion={baseVersion}
              settings={gen}
              onChange={set}
              uploading={uploading}
              onUpload={async (files) => {
                const added = await upload(files, { kind: 'site-photo', roomIds: [room.id] });
                if (added[0]) set({ baseReferenceId: added[0].id });
              }}
            />
          </StudioSection>

          <StudioSection
            n={3}
            title={T.s3}
            description={T.s3Lead}
            aside={
              <Link to={`/rooms/${room.id}/requirements`} className="text-[12px] text-ink-3 hover:text-ink">
                {T.editRequirements}
              </Link>
            }
          >
            <RequirementPicker
              requirements={requirements}
              references={references}
              excluded={excluded}
              onToggleRequirement={toggleRequirement}
              included={gen.includedReferenceIds}
              onToggleImage={toggleImage}
              roomId={room.id}
            />
          </StudioSection>

          <StudioSection n={4} title={T.s4} description={T.s4Lead}>
            <ExtraImages candidates={extraCandidates} included={gen.includedReferenceIds} onToggle={toggleImage} baseId={gen.baseReferenceId} />
          </StudioSection>

          <StudioSection n={5} title={T.s5} description={T.s5Lead}>
            <DirectionSummary room={room} override={gen.directionOverride} onOverride={(v) => set({ directionOverride: v })} />
          </StudioSection>

          <StudioSection n={6} title={T.s6}>
            <RenderSettings room={room} settings={gen} onChange={set} caps={active?.ready ? active.capabilities : null} />
          </StudioSection>

          <StudioSection n={7} title={T.s7} description={T.s7Lead}>
            <Textarea
              value={gen.instructions}
              onChange={(e) => set({ instructions: e.target.value })}
              minRows={3}
              placeholder={T.s7Placeholder}
              dir="auto"
            />
            <EnglishField source={gen.instructions} className="mt-2" />
          </StudioSection>

          <StudioSection
            n={8}
            title={T.s8}
            description={T.s8Lead}
          >
            <ConstraintList
              items={pkg.constraints}
              onToggle={(key, on) =>
                set({ disabledConstraintKeys: on ? gen.disabledConstraintKeys.filter((k) => k !== key) : [...gen.disabledConstraintKeys, key] })
              }
              extra={gen.extraConstraints}
              onExtra={(v) => set({ extraConstraints: v })}
            />
          </StudioSection>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <StudioPanel
            active={active}
            pkg={pkg}
            generatedPrompt={basePkg?.prompt ?? pkg.prompt}
            job={job}
            onGenerate={generate}
            onCancel={() => job?.controller.abort()}
            onSavePromptOnly={promptOnly}
            onMove={moveImage}
            promptOverride={promptOverride}
            onPromptOverride={setPromptOverride}
            recent={versions}
            onOpenVersion={setOpenVersion}
            onDismissJob={() => jobStore.clear(room.id)}
            onDownloadImages={downloadImages}
            onShare={shareImages}
            canShare={canShare}
            onImport={() => setImportOpen(true)}
            preparingImages={preparing}
          />
        </aside>
      </div>
      <VersionDetail version={openV} room={room} onClose={() => setOpenVersion(null)} />
      <ImportResultDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        room={room}
        pkg={pkg}
        settings={finalSettings()}
        references={references}
        onSaved={(v) => setOpenVersion(v.id)}
      />
    </div>
  );
}
