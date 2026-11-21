import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Check, ChevronDown, Columns2, Copy, Download, FileText, Repeat, RotateCcw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { DesignVersion, Room, VersionStatus } from '@/lib/types';
import { CAMERA_ANGLES, IMAGE_ROLE_LABEL, LENSES, priorityMeta, REALISM, TIMES_OF_DAY, versionStatusMeta, categoryLabel, ASPECTS } from '@/lib/labels';
import { deleteVersion, duplicateVersion, setVersionStatus, updateVersion } from '@/lib/db/versions';
import { updateRoom } from '@/lib/db/rooms';
import { dimensionSummary } from '@/lib/geometry/room';
import { formatDateTime, formatDuration } from '@/lib/format';
import { copyText, downloadBlob, safeFilename } from '@/lib/download';
import { getOriginalBlob } from '@/lib/hooks/useImageUrl';
import { useReferences } from '@/lib/hooks/data';
import { nowIso } from '@/lib/ids';
import { ImageThumb } from '@/components/images/ImageThumb';
import { useLightbox } from '@/components/images/Lightbox';
import { Button } from '@/components/ui/Button';
import { CommitInput } from '@/components/ui/Form';
import { Sheet } from '@/components/ui/Overlay';
import { Badge, StatusLabel } from '@/components/ui/Display';
import { useConfirm } from '@/components/ui/Confirm';
import { cn } from '@/components/ui/cn';

export function originLabel(v: DesignVersion): string {
  if (v.origin === 'generated') return v.provider ? `Generated · ${v.provider.providerLabel} · ${v.provider.model}` : 'Generated';
  if (v.origin === 'imported') return 'Imported design';
  if (v.origin === 'prompt-only') return 'Prompt only — no image generated';
  return 'Duplicate of an earlier version';
}

export function VersionCard({
  v,
  roomName,
  onOpen,
  selected,
  onSelect,
}: {
  v: DesignVersion;
  roomName?: string;
  onOpen: () => void;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const meta = versionStatusMeta(v.status);
  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-md border bg-surface transition-shadow hover:shadow-soft',
        selected ? 'border-ink ring-1 ring-ink' : 'border-line',
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left">
        {v.imageId ? (
          <ImageThumb imageId={v.imageId} className="aspect-[3/2] w-full" alt={`Version ${v.number}`} />
        ) : (
          <div className="hairline-grid flex aspect-[3/2] w-full flex-col items-center justify-center gap-1 bg-mist/60 text-[12px] text-ink-3">
            <FileText size={18} strokeWidth={1.5} />
            Prompt only
          </div>
        )}
        <div className="flex items-start justify-between gap-2 px-3 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-[13.5px] text-ink">
              {roomName ? `${roomName} · ` : ''}v{v.number}
              {v.title && v.title !== `Concept ${v.number}` ? ` · ${v.title}` : ''}
            </div>
            <div className="mt-0.5 text-[11.5px] text-ink-3">{formatDateTime(v.createdAt)}</div>
          </div>
          <StatusLabel tone={meta.tone}>{meta.label}</StatusLabel>
        </div>
      </button>
      {v.origin !== 'generated' && (
        <Badge tone="neutral" className="absolute left-2 top-2">
          {v.origin === 'imported' ? 'Imported' : v.origin === 'prompt-only' ? 'Prompt only' : 'Duplicate'}
        </Badge>
      )}
      {onSelect && (
        <button
          type="button"
          aria-label={selected ? 'Remove from comparison' : 'Select for comparison'}
          onClick={onSelect}
          className={cn(
            'absolute right-2 top-2 flex h-6 items-center gap-1 rounded-sm border px-1.5 text-[11px] font-medium transition-opacity',
            selected ? 'border-ink bg-ink text-white opacity-100' : 'border-white/70 bg-ink/40 text-white opacity-0 group-hover:opacity-100 focus:opacity-100',
          )}
        >
          {selected ? <Check size={12} /> : <Columns2 size={12} />} Compare
        </button>
      )}
    </article>
  );
}

function Section({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-line">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-5 py-3 text-left" aria-expanded={open}>
        <span className="eyebrow">{title}</span>
        <ChevronDown size={14} className={cn('text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-1 text-[12.5px]">
      <span className="text-ink-3">{label}</span>
      <span className="min-w-0 break-words text-ink-2">{children}</span>
    </div>
  );
}

export function VersionDetail({ version, room, onClose }: { version: DesignVersion | null; room: Room | null | undefined; onClose: () => void }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const lightbox = useLightbox();
  const allRefs = useReferences() ?? [];
  if (!version) return null;
  const linkedRefs = allRefs.filter((r) => r.versionIds.includes(version.id) && r.id !== version.referenceId);
  const v = version;
  const meta = versionStatusMeta(v.status);
  const s = v.settings;

  const setStatus = async (st: VersionStatus) => {
    await setVersionStatus(v.id, st);
    toast.success(st === 'approved' ? `v${v.number} approved` : `Marked ${versionStatusMeta(st).label.toLowerCase()}`, {
      description: st === 'approved' ? 'Earlier versions are kept unchanged.' : undefined,
    });
  };

  const restoreDirection = async () => {
    if (!room) return;
    const r = await confirm({
      title: 'Restore this design direction?',
      description: `The room's current direction will be replaced with the one used for v${v.number}. You can always restore another version's direction later.`,
      confirmLabel: 'Restore direction',
    });
    if (!r.confirmed) return;
    await updateRoom(room.id, (d) => void (d.direction = { ...structuredClone(v.roomSnapshot.direction), updatedAt: nowIso() }));
    toast.success('Design direction restored');
  };

  const remove = async () => {
    const r = await confirm({
      title: `Delete v${v.number}?`,
      tone: 'danger',
      confirmLabel: 'Delete version',
      description: 'The version, its record and its generated image are deleted. Other versions are not affected.',
      typeToConfirm: v.status === 'approved' ? 'DELETE' : undefined,
    });
    if (!r.confirmed) return;
    await deleteVersion(v.id);
    toast.success('Version deleted');
    onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} width="max-w-[720px]" title={`${room?.name ?? 'Room'} · v${v.number}`}>
      <div className="flex flex-col">
        <div className="px-5 pt-5">
          {v.imageId ? (
            <ImageThumb
              imageId={v.imageId}
              variant="full"
              fit="contain"
              className="aspect-[3/2] w-full rounded-md checker"
              onClick={() => lightbox([{ imageId: v.imageId!, title: `${room?.name ?? ''} · v${v.number}`, subtitle: v.title, description: v.notes }])}
            />
          ) : (
            <div className="hairline-grid flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 rounded-md bg-mist/60 px-8 text-center text-[13px] text-ink-3">
              <FileText size={22} strokeWidth={1.4} />
              No image — this version stores a prompt and settings only. No image was generated.
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-3">
            <span>{originLabel(v)}</span>
            <span>{formatDateTime(v.createdAt)}</span>
          </div>
          <div className="mt-4">
            <CommitInput
              value={v.title}
              onCommit={(t) => updateVersion(v.id, { title: t || `Concept ${v.number}` })}
              className="display !h-11 !border-transparent !bg-transparent !px-0 text-[24px] hover:!border-line focus:!border-ink-3 focus:!px-2"
              aria-label="Version title"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusLabel tone={meta.tone} className="mr-2 text-[13px]">
              {meta.label}
            </StatusLabel>
            {v.status !== 'approved' && (
              <Button size="sm" variant="primary" icon={Check} onClick={() => setStatus('approved')}>
                Approve
              </Button>
            )}
            {v.status !== 'under-review' && (
              <Button size="sm" onClick={() => setStatus('under-review')}>
                Under review
              </Button>
            )}
            {v.status !== 'rejected' && (
              <Button size="sm" icon={X} onClick={() => setStatus('rejected')}>
                Reject
              </Button>
            )}
            {v.status !== 'archived' && (
              <Button size="sm" variant="ghost" onClick={() => setStatus('archived')}>
                Archive
              </Button>
            )}
            {v.status !== 'draft' && (
              <Button size="sm" variant="ghost" onClick={() => setStatus('draft')}>
                Back to draft
              </Button>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <Button size="sm" icon={Repeat} onClick={() => navigate(`/studio/${v.roomId}?from=${v.id}`)}>
              New version from this
            </Button>
            <Button size="sm" icon={Columns2} onClick={() => navigate(`/library/compare?items=ver:${v.id}`)}>
              Compare
            </Button>
            <Button
              size="sm"
              icon={Copy}
              onClick={async () => {
                const c = await duplicateVersion(v.id);
                if (c) toast.success(`Duplicated as v${c.number}`);
              }}
            >
              Duplicate
            </Button>
            <Button size="sm" icon={RotateCcw} onClick={restoreDirection} disabled={!room}>
              Restore direction
            </Button>
            {v.imageId && (
              <Button
                size="sm"
                variant="ghost"
                icon={Download}
                onClick={async () => {
                  const o = await getOriginalBlob(v.imageId!);
                  if (o) downloadBlob(o.blob, `${safeFilename(room?.name ?? 'room')}-v${v.number}.${o.blob.type.split('/')[1] ?? 'png'}`);
                }}
              >
                Download
              </Button>
            )}
            <Button size="sm" variant="danger" icon={Trash2} onClick={remove} className="ml-auto">
              Delete
            </Button>
          </div>

          <div className="mt-5">
            <div className="eyebrow mb-2">Notes</div>
            <CommitInput
              multiline
              minRows={3}
              value={v.notes}
              onCommit={(t) => updateVersion(v.id, { notes: t })}
              placeholder="What works, what should change next time…"
            />
          </div>
        </div>

        <div className="mt-6">
          {v.prompt && (
            <Section title="Prompt used">
              <div className="mb-2 flex justify-end">
                <Button
                  size="xs"
                  icon={Copy}
                  onClick={async () => {
                    if (await copyText(v.prompt)) toast.success('Prompt copied');
                    else toast.error('Could not copy');
                  }}
                >
                  Copy prompt
                </Button>
              </div>
              <pre
                className="scroll-thin max-h-[420px] overflow-auto whitespace-pre-wrap rounded-sm border border-line bg-raised p-3 font-mono text-[11.5px] leading-relaxed text-ink-2"
                dir="auto"
              >
                {v.prompt}
              </pre>
            </Section>
          )}
          {s && (
            <Section title="Generation settings">
              <Row label="Camera">
                {CAMERA_ANGLES.find((a) => a.value === s.cameraAngle)?.label}
                {s.cameraNotes ? ` — ${s.cameraNotes}` : ''}
              </Row>
              <Row label="Light">{TIMES_OF_DAY.find((t) => t.value === s.timeOfDay)?.label}</Row>
              <Row label="Lens">{LENSES.find((l) => l.value === s.lens)?.label}</Row>
              <Row label="Realism">{REALISM.find((r) => r.value === s.realism)?.label}</Row>
              <Row label="Format">
                {ASPECTS.find((a) => a.value === s.aspect)?.label} · {s.quality} quality
              </Row>
              {s.prioritize.length > 0 && <Row label="Prioritised">{s.prioritize.join(', ')}</Row>}
              {s.avoid && <Row label="Avoided">{s.avoid}</Row>}
              {s.instructions && <Row label="Instructions">{s.instructions}</Row>}
              {s.directionOverride && <Row label="Direction note">{s.directionOverride}</Row>}
              {s.promptOverride && <Row label="Prompt">Edited manually</Row>}
            </Section>
          )}
          {v.provider && (
            <Section title="Provider">
              <Row label="Provider">{v.provider.providerLabel}</Row>
              <Row label="Model">{v.provider.model}</Row>
              <Row label="Endpoint">{v.provider.endpoint}</Row>
              <Row label="Parameters">{JSON.stringify(Object.fromEntries(Object.entries(v.provider.params).filter(([, x]) => x !== undefined)))}</Row>
              {v.provider.durationMs !== null && <Row label="Time">{formatDuration(v.provider.durationMs)}</Row>}
              {v.provider.revisedPrompt && <Row label="Revised prompt">{v.provider.revisedPrompt}</Row>}
              {v.provider.textResponse && <Row label="Model note">{v.provider.textResponse}</Row>}
            </Section>
          )}
          {v.inputImages.length > 0 && (
            <Section title={`Images used (${v.inputImages.filter((i) => i.sent).length} sent)`}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {v.inputImages.map((img, i) => (
                  <figure key={i} className="min-w-0">
                    {img.imageId ? (
                      <ImageThumb
                        imageId={img.imageId}
                        className="aspect-[4/3] w-full rounded-sm border border-line"
                        onClick={() => img.imageId && lightbox([{ imageId: img.imageId, title: img.label, description: img.explanation }])}
                      />
                    ) : (
                      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-sm border border-dashed border-line text-[11px] text-ink-4">
                        {img.role === 'layout-plan' ? '2D plan (rendered)' : 'No image'}
                      </div>
                    )}
                    <figcaption className="mt-1 text-[11.5px] leading-snug text-ink-2">
                      {IMAGE_ROLE_LABEL[img.role]}
                      {img.requirementTitle && <span className="text-ink-3"> · {img.requirementTitle}</span>}
                      <span className={cn('block', img.sent ? 'text-ok' : 'text-ink-4')}>{img.sent ? 'Sent as image' : 'Described in text only'}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </Section>
          )}
          {linkedRefs.length > 0 && (
            <Section title={`Linked references (${linkedRefs.length})`} defaultOpen>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {linkedRefs.map((r) => (
                  <ImageThumb
                    key={r.id}
                    imageId={r.imageId}
                    className="aspect-square w-full rounded-sm border border-line"
                    onClick={() =>
                      lightbox(
                        linkedRefs.map((x) => ({ imageId: x.imageId, title: x.title, description: x.explanation })),
                        linkedRefs.indexOf(r),
                      )
                    }
                  />
                ))}
              </div>
            </Section>
          )}
          {v.doNotChange.length > 0 && (
            <Section title="DO NOT CHANGE list">
              <ol className="list-decimal pl-5 text-[12.5px] leading-relaxed text-ink-2">
                {v.doNotChange.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
            </Section>
          )}
          <Section title={`Requirements snapshot (${v.requirementsSnapshot.length})`}>
            {v.requirementsSnapshot.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">No requirements were included.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {v.requirementsSnapshot.map((r) => (
                  <li key={r.id} className="text-[12.5px]" dir="auto">
                    <span className="text-ink">
                      {r.kind === 'avoid' ? 'Avoid: ' : ''}
                      {r.title}
                    </span>
                    <span className="text-ink-3">
                      {' '}
                      · {categoryLabel(r.category)} · {priorityMeta(r.priority).label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Dimensions snapshot">
            <Row label="Room">{v.roomSnapshot.name}</Row>
            <Row label="Dimensions">
              {dimensionSummary({ geometry: v.roomSnapshot.geometry, walls: v.roomSnapshot.walls, displayUnit: room?.displayUnit ?? 'm' } as Room)}
            </Row>
            <Row label="Ceiling">
              {v.roomSnapshot.ceilingHeight.mm === null
                ? 'Unknown'
                : `${(v.roomSnapshot.ceilingHeight.mm / 1000).toFixed(2)} m (${v.roomSnapshot.ceilingHeight.certainty})`}
            </Row>
            <Row label="Elements">{v.roomSnapshot.elements.length} recorded</Row>
            <Row label="Furniture">{v.roomSnapshot.layoutItems.length} items on plan</Row>
            <Row label="Direction">{v.roomSnapshot.direction.style || (v.roomSnapshot.direction.description ? 'Custom' : 'Not set')}</Row>
          </Section>
        </div>
        <div className="h-10" />
      </div>
    </Sheet>
  );
}
