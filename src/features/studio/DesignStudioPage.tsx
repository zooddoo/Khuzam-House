import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { GenerationSettings, ID } from '@/lib/types';
import { useFloors, useLibrary, useProject, useRequirements, useRoom, useRoomReferences, useRooms, useSettings, useVersions } from '@/lib/hooks/data';
import { buildGenerationPackage, defaultImageSelection } from '@/lib/ai/prompt';
import { activeImageProvider } from '@/lib/ai/providers/registry';
import { jobStore, useGenerationJob } from '@/lib/ai/jobs';
import { runGeneration, savePromptOnly } from '@/lib/ai/generate';
import { describeError, ProviderError } from '@/lib/ai/http';
import { defaultGenerationSettings } from '@/lib/db/factories';
import { computeRoomShape, dimensionSummary } from '@/lib/geometry/room';
import { roomTypeLabel } from '@/lib/labels';
import { useUploadReferences } from '@/components/images/useUpload';
import { ButtonLink } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/Form';
import { EmptyState, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { RoomCover, RoomStatusLabel } from '../rooms/shared';
import { VersionDetail } from '../versions/VersionDetail';
import { BaseChooser, ConstraintList, DirectionSummary, ExtraImages, RenderSettings, RequirementPicker, RoomCheck, StudioSection } from './StudioSections';
import { StudioPanel } from './StudioPanel';

export function DesignStudioPage() {
  const { roomId } = useParams();
  const [params] = useSearchParams();
  if (!roomId) return <StudioRoomPicker />;
  return <StudioForRoom key={`${roomId}-${params.get('from') ?? ''}`} roomId={roomId} fromVersionId={params.get('from')} />;
}

function StudioRoomPicker() {
  const rooms = useRooms();
  const settings = useSettings();
  const last = rooms?.find((r) => r.id === settings?.lastStudioRoomId);
  if (!rooms) return <LoadingBlock />;
  return (
    <div>
      <PageHeader
        eyebrow="AI room redesign"
        title="Design Studio"
        description="Choose a room. Its own dimensions, architecture, requirements, images and direction are assembled into a redesign request."
      />
      {last && (
        <Link
          to={`/studio/${last.id}`}
          className="mb-10 flex items-center gap-5 rounded-md border border-line bg-surface p-4 transition-shadow hover:shadow-soft"
        >
          <div className="w-40 shrink-0 overflow-hidden rounded-sm">
            <RoomCover room={last} className="aspect-[3/2]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Continue last design</div>
            <div className="display mt-1 text-[28px]">{last.name}</div>
          </div>
          <ArrowRight size={18} className="text-ink-3" />
        </Link>
      )}
      {rooms.length === 0 ? (
        <EmptyState
          title="No rooms yet"
          action={
            <ButtonLink to="/rooms?new=1" variant="primary">
              Add a room
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
                    <div className="display truncate text-[24px] group-hover:text-accent">{room.name}</div>
                    <div className="mt-1 text-[12px] text-ink-3">
                      {roomTypeLabel(room.type)} · {drawable ? dimensionSummary(room) : 'dimensions unknown'}
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
  const project = useProject();
  const room = useRoom(roomId);
  const rooms = useRooms() ?? [];
  const floors = useFloors() ?? [];
  const requirements = useRequirements(roomId);
  const references = useRoomReferences(roomId);
  const versions = useVersions(roomId);
  const library = useLibrary() ?? [];
  const settings = useSettings();
  const job = useGenerationJob(roomId);
  const { upload, busy: uploading } = useUploadReferences();
  const [gen, setGen] = useState<GenerationSettings | null>(null);
  const [excluded, setExcluded] = useState<ID[]>([]);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [openVersion, setOpenVersion] = useState<string | null>(null);
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
    if (!room || !ctxSettings || !references || !settings) return null;
    return buildGenerationPackage({
      projectName: project?.name ?? 'Bait Khuzam',
      location: project?.location ?? 'Riyadh, Saudi Arabia',
      room,
      floorName: floors.find((f) => f.id === room.floorId)?.name ?? null,
      requirements: includedReqs,
      references,
      libraryItems: library,
      baseVersion,
      settings: ctxSettings,
      capabilities: active?.ready ? active.capabilities : null,
      houseGuidelines: settings.houseGuidelines,
    });
  }, [room, ctxSettings, references, settings, project, floors, includedReqs, library, baseVersion, active?.ready, active?.capabilities]);

  const pkg = useMemo(() => {
    if (!basePkg) return null;
    if (promptOverride === null) return basePkg;
    return { ...basePkg, prompt: promptOverride, warnings: [...basePkg.warnings, { level: 'info' as const, message: 'Using your manually edited prompt.' }] };
  }, [basePkg, promptOverride]);

  if (room === null) return <EmptyState title="Room not found" action={<ButtonLink to="/studio">Choose another room</ButtonLink>} />;
  if (!room || !gen || !pkg || !requirements || !references || !versions || !settings) return <LoadingBlock label="Assembling the room's design package…" />;

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
      toast.success(`${room.name}: ${created.length > 1 ? `${created.length} new versions` : `v${created[0].number}`} saved`, {
        action: { label: 'View', onClick: () => (window.location.hash = `#/library/concepts/${created[0].id}`) },
      });
    } catch (e) {
      const aborted =
        (e instanceof ProviderError && e.code === 'aborted') || (e instanceof DOMException && e.name === 'AbortError') || j.controller.signal.aborted;
      jobStore.update(room.id, aborted ? { status: 'cancelled' } : { status: 'error', error: describeError(e) });
      if (!aborted) toast.error('Generation failed — nothing was saved', { description: describeError(e).message });
    }
  };

  const promptOnly = async () => {
    const v = await savePromptOnly(room, pkg, finalSettings(), references);
    toast.success(`Saved prompt-only version v${v.number}`, { description: 'No image was generated.' });
  };

  const openV = versions.find((v) => v.id === openVersion) ?? null;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="eyebrow mb-2 flex items-center gap-1.5">
            <Sparkles size={12} /> Design Studio
          </div>
          <h1 className="display text-[44px] sm:text-[52px]">Redesign {room.name}</h1>
          <p className="mt-2 max-w-[680px] text-[13px] leading-relaxed text-ink-3">
            Everything below is specific to this room. Review it, choose how the image should look, then generate. Each result is saved as a new version.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={room.id} onChange={(e) => navigate(`/studio/${e.target.value}`)} className="w-[220px]" aria-label="Switch room">
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <ButtonLink to={`/rooms/${room.id}/overview`}>Open room</ButtonLink>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-8">
          <StudioSection n={1} title="Room check" description="The room facts sent with the request. Unknown values are declared as unknown — never guessed.">
            <RoomCheck room={room} sitePhotoCount={sitePhotos.length} />
          </StudioSection>

          <StudioSection
            n={2}
            title="Photo to redesign"
            description="The actual room photo is sent first, so the model keeps its viewpoint, windows and doors."
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
            title="Requirements"
            description="All active requirements are included. Untick any to leave them out of this version; images stay tied to their requirement."
            aside={
              <Link to={`/rooms/${room.id}/requirements`} className="text-[12px] text-ink-3 hover:text-ink">
                Edit requirements
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

          <StudioSection n={4} title="More images" description="Other site photos, wall photos, direction references and inspiration linked to this room.">
            <ExtraImages candidates={extraCandidates} included={gen.includedReferenceIds} onToggle={toggleImage} baseId={gen.baseReferenceId} />
          </StudioSection>

          <StudioSection n={5} title="Design direction" description="This room's own direction. Nothing is inherited from other rooms.">
            <DirectionSummary room={room} override={gen.directionOverride} onOverride={(v) => set({ directionOverride: v })} />
          </StudioSection>

          <StudioSection n={6} title="Image settings">
            <RenderSettings room={room} settings={gen} onChange={set} caps={active?.ready ? active.capabilities : null} />
          </StudioSection>

          <StudioSection n={7} title="Instructions for this version" description="Optional free text, e.g. what to change compared with the last concept.">
            <Textarea
              value={gen.instructions}
              onChange={(e) => set({ instructions: e.target.value })}
              minRows={3}
              placeholder="e.g. Make the sofa lower and add a wool rug; keep everything else."
            />
          </StudioSection>

          <StudioSection
            n={8}
            title="Do not change"
            description="Generated from confirmed architecture and your constraints. Untick an item only if you explicitly want it changed in this version."
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
          />
        </aside>
      </div>
      <VersionDetail version={openV} room={room} onClose={() => setOpenVersion(null)} />
    </div>
  );
}
