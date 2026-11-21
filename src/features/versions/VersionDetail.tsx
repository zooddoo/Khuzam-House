import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Check, ChevronDown, Columns2, Copy, Download, FileText, Repeat, RotateCcw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { DesignVersion, Room, VersionStatus } from '@/lib/types';
import { CAMERA_ANGLES, imageRoleLabel, LENSES, priorityMeta, prioritizeLabel, QUALITIES, REALISM, TIMES_OF_DAY, versionStatusMeta, categoryLabel, ASPECTS } from '@/lib/labels';
import { deleteVersion, duplicateVersion, setVersionStatus, updateVersion } from '@/lib/db/versions';
import { updateRoom } from '@/lib/db/rooms';
import { dimensionSummary } from '@/lib/geometry/room';
import { fmtDateTime, fmtDuration } from '@/i18n/format';
import { formatLength } from '@/lib/units';
import { tr } from '@/i18n/messages';
import { useI18n, useT } from '@/i18n';
import { roomDisplayName } from '@/lib/names';
import { AttachmentsSection } from '@/components/files/Attachments';
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
  const t = tr().version;
  if (v.origin === 'generated') return v.provider ? t.generatedBy(v.provider.providerLabel, v.provider.model) : t.generated;
  if (v.origin === 'imported') return t.imported;
  if (v.origin === 'prompt-only') return t.promptOnly;
  return t.duplicate;
}

/** Version titles default to "Concept N" in English; show the localized default. */
export function versionTitle(v: Pick<DesignVersion, 'title' | 'number'>): string {
  const t = tr().version;
  return !v.title || v.title === `Concept ${v.number}` ? t.defaultTitle(v.number) : v.title;
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
  const t = useT();
  const meta = versionStatusMeta(v.status);
  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-md border bg-surface transition-shadow hover:shadow-soft',
        selected ? 'border-ink ring-1 ring-ink' : 'border-line',
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full text-start">
        {v.imageId ? (
          <ImageThumb imageId={v.imageId} className="aspect-[3/2] w-full" alt={t.version.alt(v.number)} />
        ) : (
          <div className="hairline-grid flex aspect-[3/2] w-full flex-col items-center justify-center gap-1 bg-mist/60 text-[12px] text-ink-3">
            <FileText size={18} strokeWidth={1.5} />
            {t.version.badgePromptOnly}
          </div>
        )}
        <div className="flex items-start justify-between gap-2 px-3 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-[13.5px] text-ink" dir="auto">
              {roomName ? `${roomName} · ` : ''}
              {t.versions.short(v.number)}
              {v.title && v.title !== `Concept ${v.number}` ? ` · ${v.title}` : ''}
            </div>
            <div className="mt-0.5 text-[11.5px] text-ink-3">{fmtDateTime(v.createdAt)}</div>
          </div>
          <StatusLabel tone={meta.tone}>{meta.label}</StatusLabel>
        </div>
      </button>
      {v.origin !== 'generated' && (
        <Badge tone="neutral" className="absolute start-2 top-2">
          {v.origin === 'imported' ? t.version.badgeImported : v.origin === 'prompt-only' ? t.version.badgePromptOnly : t.version.badgeDuplicate}
        </Badge>
      )}
      {onSelect && (
        <button
          type="button"
          aria-label={selected ? t.version.removeFromCompare : t.version.selectForCompare}
          onClick={onSelect}
          className={cn(
            'absolute end-2 top-2 flex h-8 items-center gap-1 rounded-sm border px-2 text-[11px] font-medium transition-opacity sm:h-6 sm:px-1.5',
            selected ? 'border-ink bg-ink text-white opacity-100' : 'border-white/70 bg-ink/40 text-white opacity-100 group-hover:opacity-100 focus:opacity-100 sm:opacity-0',
          )}
        >
          {selected ? <Check size={12} /> : <Columns2 size={12} />} {t.version.compare}
        </button>
      )}
    </article>
  );
}

function Section({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-line">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-h-12 w-full items-center justify-between px-5 py-3 text-start" aria-expanded={open}>
        <span className="eyebrow">{title}</span>
        <ChevronDown size={14} className={cn('text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-1 text-[12.5px]">
      <span className="text-ink-3">{label}</span>
      <span className="min-w-0 break-words text-ink-2" dir="auto">
        {children}
      </span>
    </div>
  );
}

export function VersionDetail({ version, room, onClose }: { version: DesignVersion | null; room: Room | null | undefined; onClose: () => void }) {
  const { t, lang } = useI18n();
  const T = t.version;
  const navigate = useNavigate();
  const confirm = useConfirm();
  const lightbox = useLightbox();
  const allRefs = useReferences() ?? [];
  if (!version) return null;
  const linkedRefs = allRefs.filter((r) => r.versionIds.includes(version.id) && r.id !== version.referenceId);
  const v = version;
  const meta = versionStatusMeta(v.status);
  const s = v.settings;
  const vLabel = t.versions.short(v.number);
  const roomName = room ? roomDisplayName(room, lang) : T.room;

  const setStatus = async (st: VersionStatus) => {
    await setVersionStatus(v.id, st);
    toast.success(st === 'approved' ? T.approved(vLabel) : T.marked(versionStatusMeta(st).label), {
      description: st === 'approved' ? T.earlierKept : undefined,
    });
  };

  const restoreDirection = async () => {
    if (!room) return;
    const r = await confirm({ title: T.restoreDirTitle, description: T.restoreDirBody(vLabel), confirmLabel: T.restoreDir });
    if (!r.confirmed) return;
    await updateRoom(room.id, (d) => void (d.direction = { ...structuredClone(v.roomSnapshot.direction), updatedAt: nowIso() }));
    toast.success(T.dirRestored);
  };

  const remove = async () => {
    const r = await confirm({
      title: T.deleteTitle(vLabel),
      tone: 'danger',
      confirmLabel: T.deleteConfirm,
      description: T.deleteBody,
      typeToConfirm: v.status === 'approved' ? t.roomForm.typeWord : undefined,
    });
    if (!r.confirmed) return;
    await deleteVersion(v.id);
    toast.success(T.deleted, { description: t.trash.moveHint });
    onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} width="max-w-[720px]" title={`${roomName} · ${vLabel}`}>
      <div className="flex flex-col">
        <div className="px-5 pt-5">
          {v.imageId ? (
            <ImageThumb
              imageId={v.imageId}
              variant="full"
              fit="contain"
              className="aspect-[3/2] w-full rounded-md checker"
              onClick={() => lightbox([{ imageId: v.imageId!, title: `${roomName} · ${vLabel}`, subtitle: versionTitle(v), description: v.notes }])}
            />
          ) : (
            <div className="hairline-grid flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 rounded-md bg-mist/60 px-8 text-center text-[13px] text-ink-3">
              <FileText size={22} strokeWidth={1.4} />
              {T.noImage}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-3">
            <span>{originLabel(v)}</span>
            <span>{fmtDateTime(v.createdAt)}</span>
          </div>
          <div className="mt-4">
            <CommitInput
              value={versionTitle(v)}
              onCommit={(x) => x !== versionTitle(v) && updateVersion(v.id, { title: x || `Concept ${v.number}` })}
              className="display !h-11 !border-transparent !bg-transparent !px-0 !text-[24px] hover:!border-line focus:!border-ink-3 focus:!px-2"
              aria-label={T.titleAria}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusLabel tone={meta.tone} className="me-2 text-[13px]">
              {meta.label}
            </StatusLabel>
            {v.status !== 'approved' && (
              <Button size="sm" variant="primary" icon={Check} onClick={() => setStatus('approved')}>
                {T.approve}
              </Button>
            )}
            {v.status !== 'under-review' && (
              <Button size="sm" onClick={() => setStatus('under-review')}>
                {T.underReview}
              </Button>
            )}
            {v.status !== 'rejected' && (
              <Button size="sm" icon={X} onClick={() => setStatus('rejected')}>
                {T.reject}
              </Button>
            )}
            {v.status !== 'archived' && (
              <Button size="sm" variant="ghost" onClick={() => setStatus('archived')}>
                {T.archive}
              </Button>
            )}
            {v.status !== 'draft' && (
              <Button size="sm" variant="ghost" onClick={() => setStatus('draft')}>
                {T.backToDraft}
              </Button>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <Button size="sm" icon={Repeat} onClick={() => navigate(`/studio/${v.roomId}?from=${v.id}`)}>
              {T.newFrom}
            </Button>
            <Button size="sm" icon={Columns2} onClick={() => navigate(`/library/compare?items=ver:${v.id}`)}>
              {T.compare}
            </Button>
            <Button
              size="sm"
              icon={Copy}
              onClick={async () => {
                const c = await duplicateVersion(v.id);
                if (c) toast.success(T.duplicated(t.versions.short(c.number)));
              }}
            >
              {t.common.duplicate}
            </Button>
            <Button size="sm" icon={RotateCcw} onClick={restoreDirection} disabled={!room}>
              {T.restoreDir}
            </Button>
            {v.imageId && (
              <Button
                size="sm"
                variant="ghost"
                icon={Download}
                onClick={async () => {
                  const o = await getOriginalBlob(v.imageId!);
                  if (o) downloadBlob(o.blob, `${safeFilename(room?.name || room?.nameAr || 'room')}-v${v.number}.${o.blob.type.split('/')[1] ?? 'png'}`);
                }}
              >
                {t.common.download}
              </Button>
            )}
            <Button size="sm" variant="danger" icon={Trash2} onClick={remove} className="ms-auto">
              {t.common.deleteEllipsis}
            </Button>
          </div>

          <div className="mt-5">
            <div className="eyebrow mb-2">{T.notesTitle}</div>
            <CommitInput multiline minRows={3} value={v.notes} onCommit={(x) => updateVersion(v.id, { notes: x })} placeholder={T.notesPlaceholder} />
          </div>
          <AttachmentsSection field="versionIds" value={v.id} title={T.filesTitle} defaults={{ kind: 'document', roomIds: [v.roomId] }} className="mt-5" compact />
        </div>

        <div className="mt-6">
          {v.prompt && (
            <Section title={T.promptUsed}>
              <div className="mb-2 flex justify-end">
                <Button
                  size="xs"
                  icon={Copy}
                  onClick={async () => {
                    if (await copyText(v.prompt)) toast.success(T.promptCopied);
                    else toast.error(t.common.copyFailed);
                  }}
                >
                  {T.copyPrompt}
                </Button>
              </div>
              <pre
                className="scroll-thin max-h-[420px] overflow-auto whitespace-pre-wrap rounded-sm border border-line bg-raised p-3 font-mono text-[11.5px] leading-relaxed text-ink-2"
                dir="ltr"
              >
                {v.prompt}
              </pre>
            </Section>
          )}
          {s && (
            <Section title={T.settings}>
              <Row label={T.camera}>
                {CAMERA_ANGLES.find((a) => a.value === s.cameraAngle)?.label}
                {s.cameraNotes ? ` — ${s.cameraNotes}` : ''}
              </Row>
              <Row label={T.light}>{TIMES_OF_DAY.find((x) => x.value === s.timeOfDay)?.label}</Row>
              <Row label={T.lens}>{LENSES.find((l) => l.value === s.lens)?.label}</Row>
              <Row label={T.realism}>{REALISM.find((r) => r.value === s.realism)?.label}</Row>
              <Row label={T.format}>
                {ASPECTS.find((a) => a.value === s.aspect)?.label} · {T.quality(QUALITIES.find((q) => q.value === s.quality)?.label ?? s.quality)}
              </Row>
              {s.prioritize.length > 0 && <Row label={T.prioritised}>{s.prioritize.map((x) => prioritizeLabel(x)).join('، ')}</Row>}
              {s.avoid && <Row label={T.avoided}>{s.avoid}</Row>}
              {s.instructions && <Row label={T.instructions}>{s.instructions}</Row>}
              {s.directionOverride && <Row label={T.directionNote}>{s.directionOverride}</Row>}
              {s.promptOverride && <Row label={T.prompt}>{T.editedManually}</Row>}
            </Section>
          )}
          {v.provider && (
            <Section title={T.provider}>
              <Row label={T.provider}>{v.provider.providerLabel}</Row>
              <Row label={T.model}>{v.provider.model}</Row>
              <Row label={T.endpoint}>{v.provider.endpoint}</Row>
              <Row label={T.parameters}>{JSON.stringify(Object.fromEntries(Object.entries(v.provider.params).filter(([, x]) => x !== undefined)))}</Row>
              {v.provider.durationMs !== null && <Row label={T.time}>{fmtDuration(v.provider.durationMs)}</Row>}
              {v.provider.revisedPrompt && <Row label={T.revisedPrompt}>{v.provider.revisedPrompt}</Row>}
              {v.provider.textResponse && <Row label={T.modelNote}>{v.provider.textResponse}</Row>}
            </Section>
          )}
          {v.inputImages.length > 0 && (
            <Section title={T.imagesUsed(v.inputImages.filter((i) => i.sent).length)}>
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
                        {img.role === 'layout-plan' ? T.planRendered : T.noImageShort}
                      </div>
                    )}
                    <figcaption className="mt-1 text-[11.5px] leading-snug text-ink-2">
                      {imageRoleLabel(img.role)}
                      {img.requirementTitle && (
                        <span className="text-ink-3" dir="auto">
                          {' '}
                          · {img.requirementTitle}
                        </span>
                      )}
                      <span className={cn('block', img.sent ? 'text-ok' : 'text-ink-4')}>{img.sent ? T.sent : T.textOnly}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </Section>
          )}
          {linkedRefs.length > 0 && (
            <Section title={T.linkedRefs(linkedRefs.length)} defaultOpen>
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
            <Section title={T.dnc}>
              <ol className="list-decimal ps-5 text-[12.5px] leading-relaxed text-ink-2" dir="ltr">
                {v.doNotChange.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ol>
            </Section>
          )}
          {v.translations && v.translations.length > 0 && (
            <Section title={T.translationsSnapshot(v.translations.length)}>
              <ul className="flex flex-col gap-2 text-[12.5px]">
                {v.translations.map((x, i) => (
                  <li key={i} className="rounded-sm border border-line bg-raised p-2">
                    <div dir="rtl" className="text-ink">
                      {x.source}
                    </div>
                    <div dir="ltr" className="mt-0.5 text-ink-3">
                      {x.en}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section title={T.reqSnapshot(v.requirementsSnapshot.length)}>
            {v.requirementsSnapshot.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">{T.noReqs}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {v.requirementsSnapshot.map((r) => (
                  <li key={r.id} className="text-[12.5px]" dir="auto">
                    <span className="text-ink">
                      {r.kind === 'avoid' ? T.avoidPrefix : ''}
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
          <Section title={T.dimsSnapshot}>
            <Row label={T.room}>{v.roomSnapshot.name}</Row>
            <Row label={T.dims}>{dimensionSummary({ geometry: v.roomSnapshot.geometry, walls: v.roomSnapshot.walls, displayUnit: room?.displayUnit ?? 'm' } as Room)}</Row>
            <Row label={T.ceiling}>
              {v.roomSnapshot.ceilingHeight.mm === null
                ? t.common.unknown
                : `${formatLength(v.roomSnapshot.ceilingHeight.mm, 'm')} (${t.enums.certainty[v.roomSnapshot.ceilingHeight.certainty]})`}
            </Row>
            <Row label={T.elements}>{T.elementsCount(v.roomSnapshot.elements.length)}</Row>
            <Row label={T.furniture}>{T.furnitureCount(v.roomSnapshot.layoutItems.length)}</Row>
            <Row label={T.direction}>{v.roomSnapshot.direction.style || (v.roomSnapshot.direction.description ? T.custom : T.notSet)}</Row>
          </Section>
        </div>
        <div className="h-10" />
      </div>
    </Sheet>
  );
}
