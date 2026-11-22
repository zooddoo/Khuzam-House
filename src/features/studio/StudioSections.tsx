import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Ban, Check, ImagePlus, Lock, Plus } from 'lucide-react';
import type { DesignVersion, GenerationSettings, ID, Reference, Requirement, Room } from '@/lib/types';
import type { ConstraintItem } from '@/lib/ai/prompt';
import { computeRoomShape, dimensionSummary, areaSummary } from '@/lib/geometry/room';
import { formatLength, isKnown } from '@/lib/units';
import {
  ASPECTS,
  AVOID_SUGGESTIONS,
  CAMERA_ANGLES,
  categoryLabel,
  LENSES,
  PRIORITIES,
  PRIORITIZE_OPTIONS,
  QUALITIES,
  REALISM,
  referenceKindLabel,
  spaceKind,
  TIMES_OF_DAY,
} from '@/lib/labels';
import { directionIsEmpty } from '@/lib/db/factories';
import { ImageThumb } from '@/components/images/ImageThumb';
import { IntentMark } from '@/components/images/references';
import { UploadButton } from '@/components/images/Dropzone';
import { Callout } from '@/components/ui/Display';
import { EnglishField } from '@/components/translate/EnglishField';
import { Checkbox, Chip, Field, Input, Segmented, Select, Textarea, Toggle } from '@/components/ui/Form';
import { cn } from '@/components/ui/cn';
import type { ProviderCapabilities } from '@/lib/ai/providers/types';
import { useT } from '@/i18n';
import { num } from '@/i18n/format';
import { prioritizeLabel, avoidSuggestionLabel } from '@/lib/labels';
import { wallTitle } from '@/lib/geometry/names';

export function StudioSection({
  n,
  title,
  description,
  children,
  aside,
}: {
  n: number;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="border-t border-line pt-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="display mt-0.5 text-[22px] leading-none text-ink-4 tabular">{n}</span>
          <div>
            <h3 className="display text-[24px] leading-tight">{title}</h3>
            {description && <p className="mt-1 max-w-[620px] text-[12.5px] leading-relaxed text-ink-3">{description}</p>}
          </div>
        </div>
        {aside}
      </div>
      <div className="sm:ps-9">{children}</div>
    </section>
  );
}

export function RoomCheck({ room, sitePhotoCount }: { room: Room; sitePhotoCount: number }) {
  const t = useT();
  const T = t.studio;
  const shape = computeRoomShape(room);
  const kind = spaceKind(room.type);
  const els = room.elements;
  const confirmed = els.filter((e) => e.status === 'confirmed').length;
  const notes: string[] = [];
  if (!shape.drawable) notes.push(T.checkIncomplete(shape.missing.join('، ')));
  if (kind === 'interior' && !isKnown(room.ceilingHeight)) notes.push(T.checkCeiling);
  if (!els.length) notes.push(T.checkNoElements);
  else if (confirmed < els.length) notes.push(T.checkEstimated(els.length - confirmed));
  if (!sitePhotoCount) notes.push(T.checkNoPhotos);
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-4">
        <div>
          <dt className="eyebrow">{T.dimensions}</dt>
          <dd className="mt-1 text-ink tabular">{dimensionSummary(room)}</dd>
        </div>
        <div>
          <dt className="eyebrow">{T.area}</dt>
          <dd className="mt-1 text-ink tabular">{areaSummary(shape)}</dd>
        </div>
        <div>
          <dt className="eyebrow">{kind === 'interior' ? T.ceiling : T.height}</dt>
          <dd className="mt-1 text-ink tabular">{formatLength(room.ceilingHeight.mm, room.displayUnit)}</dd>
        </div>
        <div>
          <dt className="eyebrow">{T.fixedElements}</dt>
          <dd className="mt-1 text-ink">
            {T.elementsCount(els.length, confirmed)}
          </dd>
        </div>
      </dl>
      {notes.length > 0 && (
        <Callout
          tone="warn"
          action={
            <Link to={`/rooms/${room.id}/dimensions`} className="text-[12.5px] font-medium text-accent hover:underline">
              {T.editRoomData}
            </Link>
          }
        >
          <ul className="list-disc ps-4">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Callout>
      )}
    </div>
  );
}

export function BaseChooser({
  sitePhotos,
  baseVersion,
  settings,
  onChange,
  onUpload,
  uploading,
}: {
  sitePhotos: Reference[];
  baseVersion: DesignVersion | null;
  settings: GenerationSettings;
  onChange: (patch: Partial<GenerationSettings>) => void;
  onUpload: (files: File[]) => void;
  uploading: boolean;
}) {
  const T = useT().studio;
  const iterating = !!settings.baseVersionId && !!baseVersion;
  return (
    <div className="flex flex-col gap-3">
      {iterating && baseVersion && (
        <div className="flex items-center gap-4 rounded-md border border-accent/40 bg-accent-soft/40 p-3">
          <ImageThumb imageId={baseVersion.imageId} className="h-20 w-28 shrink-0 rounded-sm" />
          <div className="min-w-0 flex-1 text-[12.5px]">
            <div className="font-medium text-ink">{T.revising(baseVersion.number)}</div>
            <div className="text-ink-3">{T.revisingHint}</div>
          </div>
          <button type="button" onClick={() => onChange({ baseVersionId: null })} className="text-[12px] text-accent hover:underline">
            {T.startFromPhoto}
          </button>
        </div>
      )}
      <div className="scroll-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        <button
          type="button"
          onClick={() => onChange({ baseReferenceId: null })}
          className={cn(
            'flex h-[120px] w-[150px] shrink-0 flex-col items-center justify-center gap-1 rounded-md border px-3 text-center text-[12px]',
            !settings.baseReferenceId ? 'border-ink ring-1 ring-ink' : 'border-dashed border-line-strong text-ink-3 hover:border-ink-4',
          )}
        >
          <span className="text-ink-2">{T.noPhoto}</span>
          <span className="text-[11px] text-ink-4">{T.fromDescription}</span>
        </button>
        {sitePhotos.map((r) => {
          const on = settings.baseReferenceId === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onChange({ baseReferenceId: r.id })}
              className={cn(
                'relative w-[180px] shrink-0 overflow-hidden rounded-md border text-start',
                on ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-line-strong',
              )}
            >
              <ImageThumb imageId={r.imageId} className="h-[120px] w-full" />
              {on && (
                <span className="absolute end-2 top-2 flex h-6 items-center gap-1 rounded-sm bg-ink px-1.5 text-[11px] text-white">
                  <Check size={12} /> {iterating ? T.context : T.redesign}
                </span>
              )}
              <div className="truncate px-2 py-1.5 text-[11.5px] text-ink-2">{r.title || T.sitePhoto}</div>
            </button>
          );
        })}
        <div className="flex h-[120px] w-[150px] shrink-0 items-center justify-center rounded-md border border-dashed border-line-strong">
          <UploadButton size="sm" variant="ghost" icon={ImagePlus} loading={uploading} onFiles={onUpload} imagesOnly multiple={false}>
            {T.uploadPhoto}
          </UploadButton>
        </div>
      </div>
      {!sitePhotos.length && (
        <p className="text-[12px] text-ink-3">{T.uploadPhotoHint}</p>
      )}
    </div>
  );
}

export function RequirementPicker({
  requirements,
  references,
  excluded,
  onToggleRequirement,
  included,
  onToggleImage,
  roomId,
}: {
  requirements: Requirement[];
  references: Reference[];
  excluded: ID[];
  onToggleRequirement: (id: ID, on: boolean) => void;
  included: ID[];
  onToggleImage: (refId: ID, on: boolean) => void;
  roomId: ID;
}) {
  const T = useT().studio;
  const usable = requirements.filter((r) => r.status !== 'rejected');
  const rejected = requirements.length - usable.length;
  if (!requirements.length)
    return (
      <p className="text-[12.5px] text-ink-3">
        {T.noRequirements}{' '}
        <Link to={`/rooms/${roomId}/requirements`} className="text-accent hover:underline">
          {T.writeRequirements}
        </Link>
      </p>
    );
  return (
    <div className="flex flex-col gap-4">
      {PRIORITIES.map((p) => {
        const list = usable.filter((r) => r.priority === p.value);
        if (!list.length) return null;
        return (
          <div key={p.value}>
            <div className="eyebrow mb-1.5">{p.label}</div>
            <ul className="flex flex-col gap-1">
              {list.map((r) => {
                const on = !excluded.includes(r.id);
                const imgs = references.filter((x) => x.requirementIds.includes(r.id));
                return (
                  <li
                    key={r.id}
                    className={cn('rounded-md border px-3 py-2', on ? 'border-line bg-surface' : 'border-dashed border-line bg-transparent opacity-60')}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox checked={on} onChange={(v) => onToggleRequirement(r.id, v)} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] leading-snug text-ink" dir="auto">
                          {r.kind === 'avoid' && <Ban size={12} className="-mt-0.5 me-1 inline text-danger" />}
                          {r.title}
                        </div>
                        <div className="text-[11.5px] text-ink-3">
                          {categoryLabel(r.category)}
                          {r.status === 'needs-review' && ` · ${T.needsReview}`}
                        </div>
                      </div>
                      {imgs.length > 0 && (
                        <div className="flex gap-1.5">
                          {imgs.map((img) => {
                            const sel = on && included.includes(img.id);
                            return (
                              <button
                                key={img.id}
                                type="button"
                                disabled={!on}
                                onClick={() => onToggleImage(img.id, !sel)}
                                title={sel ? T.imgIncluded : T.imgLeftOut}
                                className={cn('relative h-11 w-11 overflow-hidden rounded-sm border-2', sel ? 'border-ink' : 'border-transparent opacity-40')}
                              >
                                <ImageThumb imageId={img.imageId} className="h-full w-full" />
                                {img.intent === 'avoid' && (
                                  <span className="absolute inset-x-0 bottom-0 bg-danger/85 text-center text-[8.5px] font-medium uppercase text-white">
                                    {T.avoidTag}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {rejected > 0 && <p className="text-[11.5px] text-ink-4">{T.rejectedLeftOut(rejected)}</p>}
    </div>
  );
}

export function ExtraImages({
  candidates,
  included,
  onToggle,
  baseId,
}: {
  candidates: Reference[];
  included: ID[];
  onToggle: (id: ID, on: boolean) => void;
  baseId: ID | null;
}) {
  const T = useT().studio;
  const list = candidates.filter((r) => r.id !== baseId);
  if (!list.length)
    return (
      <p className="text-[12.5px] text-ink-3">{T.noExtraImages}</p>
    );
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
      {list.map((r) => {
        const on = included.includes(r.id);
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onToggle(r.id, !on)}
            className={cn(
              'relative overflow-hidden rounded-md border text-start',
              on ? 'border-ink ring-1 ring-ink' : 'border-line opacity-70 hover:opacity-100',
            )}
          >
            <ImageThumb imageId={r.imageId} className="aspect-square w-full" />
            <IntentMark intent={r.intent} className="absolute start-1.5 top-1.5" />
            {on && (
              <span className="absolute end-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-sm bg-ink text-white">
                <Check size={11} />
              </span>
            )}
            <div className="truncate px-1.5 py-1 text-[11px] text-ink-2">{r.title || referenceKindLabel(r.kind)}</div>
          </button>
        );
      })}
    </div>
  );
}

export function DirectionSummary({ room, override, onOverride }: { room: Room; override: string; onOverride: (v: string) => void }) {
  const T = useT().studio;
  const d = room.direction;
  return (
    <div className="flex flex-col gap-3">
      {directionIsEmpty(d) ? (
        <p className="text-[12.5px] text-ink-3">
          {T.noDirection}{' '}
          <Link to={`/rooms/${room.id}/direction`} className="text-accent hover:underline">
            {T.setDirection}
          </Link>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-4 rounded-md border border-line bg-surface p-3">
          {d.palette.length > 0 && (
            <div className="flex h-10 w-32 overflow-hidden rounded-sm">
              {d.palette.map((c) => (
                <div key={c.id} className="flex-1" style={{ background: c.hex }} />
              ))}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[14px] text-ink" dir="auto">{d.style || T.customDirection}</div>
            <div className="truncate text-[12px] text-ink-3" dir="auto">{[d.atmosphere, d.materials].filter(Boolean).join(' · ') || d.description}</div>
          </div>
          <Link to={`/rooms/${room.id}/direction`} className="text-[12px] text-accent hover:underline">
            {T.edit}
          </Link>
        </div>
      )}
      <Field label={T.directionNote} hint={T.directionNoteHint}>
        <Textarea value={override} onChange={(e) => onOverride(e.target.value)} minRows={1} dir="auto" />
      </Field>
      <EnglishField source={override} compact />
    </div>
  );
}

export function RenderSettings({
  room,
  settings,
  onChange,
  caps,
}: {
  room: Room;
  settings: GenerationSettings;
  onChange: (p: Partial<GenerationSettings>) => void;
  caps: ProviderCapabilities | null;
}) {
  const t = useT();
  const T = t.studio;
  const shape = computeRoomShape(room);
  const aspects = caps?.aspects.length ? ASPECTS.filter((a) => caps.aspects.includes(a.value)) : ASPECTS;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <Field label={T.cameraAngle}>
          <Select value={settings.cameraAngle} onChange={(e) => onChange({ cameraAngle: e.target.value as GenerationSettings['cameraAngle'] })}>
            {CAMERA_ANGLES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        {settings.cameraAngle !== 'match-photo' && shape.segments.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={T.cameraNear}>
              <Select value={settings.cameraFrom} onChange={(e) => onChange({ cameraFrom: e.target.value })}>
                <option value="">{T.anywhere}</option>
                {shape.segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {wallTitle(s)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={T.lookingTowards}>
              <Select value={settings.cameraFacing} onChange={(e) => onChange({ cameraFacing: e.target.value })}>
                <option value="">{T.anyWall}</option>
                {shape.segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {wallTitle(s)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </div>
      <Field label={T.cameraNotes}>
        <Input
          value={settings.cameraNotes}
          onChange={(e) => onChange({ cameraNotes: e.target.value })}
          placeholder={T.cameraNotesPlaceholder}
          dir="auto"
        />
      </Field>
      <EnglishField source={settings.cameraNotes} compact />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <Field label={T.light}>
          <Segmented
            size="sm"
            value={settings.timeOfDay}
            onChange={(v) => onChange({ timeOfDay: v })}
            options={TIMES_OF_DAY.map((t) => ({ value: t.value, label: t.label }))}
          />
        </Field>
        <Field label={T.perspective}>
          <Segmented
            size="sm"
            value={settings.lens}
            onChange={(v) => onChange({ lens: v })}
            options={LENSES.map((l) => ({ value: l.value, label: l.label }))}
          />
        </Field>
        <Field label={T.realism}>
          <Segmented
            size="sm"
            value={settings.realism}
            onChange={(v) => onChange({ realism: v })}
            options={REALISM.map((r) => ({ value: r.value, label: r.label }))}
          />
        </Field>
        {aspects.length > 0 ? (
          <Field label={T.format}>
            <Segmented
              size="sm"
              value={aspects.some((a) => a.value === settings.aspect) ? settings.aspect : aspects[0].value}
              onChange={(v) => onChange({ aspect: v })}
              options={aspects.map((a) => ({ value: a.value, label: a.label }))}
            />
          </Field>
        ) : (
          <p className="pt-6 text-[12px] text-ink-3">{T.keepsAspect}</p>
        )}
        {(!caps || caps.quality) && (
          <Field label={T.quality}>
            <Segmented
              size="sm"
              value={settings.quality}
              onChange={(v) => onChange({ quality: v })}
              options={QUALITIES.map((q) => ({ value: q.value, label: q.label }))}
            />
          </Field>
        )}
        <Field label={T.variations} hint={T.variationsHint}>
          <Segmented
            size="sm"
            value={String(Math.min(settings.variations, caps?.variationsMax ?? 4))}
            onChange={(v) => onChange({ variations: Number(v) })}
            options={Array.from({ length: Math.max(1, caps?.variationsMax ?? 4) }, (_, i) => ({ value: String(i + 1), label: num(i + 1) }))}
          />
        </Field>
      </div>
      <Field label={T.prioritise}>
        <div className="flex flex-wrap gap-1.5">
          {PRIORITIZE_OPTIONS.map((p) => {
            const on = settings.prioritize.includes(p);
            return (
              <Chip key={p} active={on} onClick={() => onChange({ prioritize: on ? settings.prioritize.filter((x) => x !== p) : [...settings.prioritize, p] })}>
                {prioritizeLabel(p)}
              </Chip>
            );
          })}
        </div>
      </Field>
      <Field label={T.avoidInImage} hint={T.avoidInImageHint}>
        <Input value={settings.avoid} onChange={(e) => onChange({ avoid: e.target.value })} dir="auto" />
        <EnglishField source={settings.avoid} compact className="mt-1" />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {AVOID_SUGGESTIONS.filter((a) => !settings.avoid.toLowerCase().includes(a)).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onChange({ avoid: settings.avoid.trim() ? `${settings.avoid.trim().replace(/,$/, '')}, ${a}` : a })}
              className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink"
            >
              <Plus size={11} /> {avoidSuggestionLabel(a)}
            </button>
          ))}
        </div>
      </Field>
      {room.layout.items.length > 0 && shape.drawable && (
        <Toggle
          checked={settings.includeLayoutPlan}
          onChange={(v) => onChange({ includeLayoutPlan: v })}
          label={T.sendLayout}
          description={T.sendLayoutHint}
        />
      )}
    </div>
  );
}

export function ConstraintList({
  items,
  onToggle,
  extra,
  onExtra,
}: {
  items: ConstraintItem[];
  onToggle: (key: string, on: boolean) => void;
  extra: string;
  onExtra: (v: string) => void;
}) {
  const T = useT().studio;
  const lockable = items.filter((c) => c.source !== 'one-off');
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-1.5">
        {lockable.map((c) => (
          <li
            key={c.key}
            className={cn(
              'flex items-start gap-3 rounded-md border px-3 py-2',
              c.enabled ? 'border-line bg-surface' : 'border-dashed border-warn/50 bg-warn-soft/30',
            )}
          >
            <Checkbox checked={c.enabled} onChange={(v) => onToggle(c.key, v)} />
            <div className="min-w-0 flex-1 text-[12.5px] leading-relaxed">
              <span className={c.enabled ? 'text-ink' : 'text-ink-3 line-through'} dir="ltr" lang="en">{c.text}</span>
              <span className="ms-2 inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider text-ink-4">
                {c.enabled && <Lock size={9} />}
                {T.constraintSource[c.source] ?? T.constraintSource.rule}
              </span>
              {!c.enabled && <div className="text-[11.5px] text-warn">{T.unlocked}</div>}
            </div>
          </li>
        ))}
      </ul>
      <Field label={T.oneOff} hint={T.oneOffHint}>
        <Textarea
          value={extra}
          onChange={(e) => onExtra(e.target.value)}
          minRows={2}
          placeholder={T.oneOffPlaceholder}
          dir="auto"
        />
      </Field>
      {extra
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => (
          <EnglishField key={l} source={l} compact />
        ))}
    </div>
  );
}
