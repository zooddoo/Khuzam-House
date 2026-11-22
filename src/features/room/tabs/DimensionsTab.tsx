import { useMemo, useState } from 'react';
import { CornerDownRight, Plus, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Corner, LengthUnit, Measure, Room, RoomShape } from '@/lib/types';
import {
  computeRoomShape,
  cornerLabel,
  createWall,
  elementIssues,
  toCustomGeometry,
  toRectangleGeometry,
  wallAreas,
  type GeometryIssue,
} from '@/lib/geometry/room';
import { formatArea, formatLength, formatVolume, isKnown, unitLabel } from '@/lib/units';
import { wallTitle } from '@/lib/geometry/names';
import { num } from '@/i18n/format';
import { useI18n, useT } from '@/i18n';
import { newId } from '@/lib/ids';
import { normalizeAngle } from '@/lib/geometry/polygon';
import { spaceKind } from '@/lib/labels';
import { updateRoom } from '@/lib/db/rooms';
import { useSettings } from '@/lib/hooks/data';
import { MeasureInput } from '@/components/ui/MeasureInput';
import { CommitInput, Field, Segmented, Select, Toggle } from '@/components/ui/Form';
import { Button, IconButton } from '@/components/ui/Button';
import { Callout, GroupLabel } from '@/components/ui/Display';
import { useConfirm } from '@/components/ui/Confirm';
import { cn } from '@/components/ui/cn';
import { PlanPreview } from '@/components/plan/PlanPreview';

const HEADINGS: number[] = [0, 90, 180, 270, 45, 135, 225, 315];

function IssueList({ issues }: { issues: GeometryIssue[] }) {
  if (!issues.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {issues.map((i, k) => (
        <Callout key={k} tone={i.level === 'error' ? 'danger' : i.level === 'warning' ? 'warn' : 'info'}>
          {i.message}
        </Callout>
      ))}
    </div>
  );
}

function CornerPicker({ value, onChange }: { value: Corner; onChange: (c: Corner) => void }) {
  const t = useT();
  const cells: Corner[] = ['nw', 'ne', 'sw', 'se'];
  return (
    <div className="grid w-[100px] grid-cols-2 gap-1" dir="ltr" role="radiogroup" aria-label={t.dims.cutoutCorner}>
      {cells.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          title={cornerLabel(c)}
          onClick={() => onChange(c)}
          className={cn(
            'h-11 rounded-[3px] border text-[10.5px] font-medium uppercase',
            value === c ? 'border-ink bg-ink text-canvas' : 'border-line bg-raised text-ink-3 hover:border-ink-4',
          )}
        >
          {t.dims.cornerCodes[c]}
        </button>
      ))}
    </div>
  );
}

export function DimensionsTab({ room }: { room: Room }) {
  const { t, lang } = useI18n();
  const D = t.dims;
  const settings = useSettings();
  const confirm = useConfirm();
  const [hoverWall, setHoverWall] = useState<string | null>(null);
  const shape = useMemo(() => computeRoomShape(room), [room]);
  const areas = useMemo(() => wallAreas(room, shape), [room, shape]);
  const elIssues = useMemo(() => elementIssues(room, shape), [room, shape]);
  const unit = room.displayUnit;
  const g = room.geometry;
  const kind = spaceKind(room.type);
  const defCert = settings?.defaultCertainty ?? 'confirmed';
  const setG = (recipe: (d: Room) => void) => updateRoom(room.id, recipe);

  const switchShape = async (to: RoomShape) => {
    if (to === g.shape) return;
    if (to === 'custom') {
      const next = toCustomGeometry(room);
      await setG((d) => {
        d.geometry = next.geometry;
        d.walls = next.walls;
      });
      toast.success(D.convertedToCustom, { description: D.convertedToCustomHint });
      return;
    }
    if (to === 'rectangle') {
      const next = toRectangleGeometry(room);
      if (next.lossy) {
        const r = await confirm({ title: D.toRectTitle, confirmLabel: D.switch, description: g.shape === 'l-shape' ? D.toRectFromL : D.toRectFromCustom });
        if (!r.confirmed) return;
      }
      await setG((d) => {
        d.geometry = next.geometry;
        d.walls = next.walls;
      });
      return;
    }
    // to L-shape
    if (g.shape === 'custom') {
      const r = await confirm({ title: D.toLTitle, confirmLabel: D.switch, description: D.toLFromCustom });
      if (!r.confirmed) return;
      const bounds = shape.drawable ? shape.bounds : null;
      await setG((d) => {
        d.geometry.shape = 'l-shape';
        if (bounds) {
          d.geometry.length = { mm: Math.round(bounds.width), certainty: 'estimated' };
          d.geometry.width = { mm: Math.round(bounds.height), certainty: 'estimated' };
        }
      });
      return;
    }
    await setG((d) => {
      d.geometry.shape = 'l-shape';
    });
  };

  const setWallLength = (i: number, m: Measure) => setG((d) => void (d.walls[i].length = m));
  const addWall = () =>
    setG((d) => {
      const prev = d.walls[d.walls.length - 1];
      d.walls.push(createWall(newId('w'), 'Wall', { heading: prev ? normalizeAngle(prev.heading + 90) : 0 }));
    });
  const removeWall = async (i: number) => {
    const w = room.walls[i];
    const onWall = room.elements.filter((e) => e.wallId === w.id).length;
    const r = await confirm({
      title: D.removeWallTitle(wallTitle(w, lang)),
      tone: 'danger',
      confirmLabel: D.removeWall,
      description: onWall ? D.removeWallOn(onWall) : D.removeWallRecalc,
    });
    if (r.confirmed) await setG((d) => void d.walls.splice(i, 1));
  };
  const addClosingWall = () => {
    const last = shape.segments[shape.segments.length - 1];
    const first = shape.segments[0];
    if (!last?.end || !first?.start || shape.closureGapMm === null) return;
    const dx = first.start.x - last.end.x;
    const dy = first.start.y - last.end.y;
    const heading = normalizeAngle(Math.round((Math.atan2(dy, dx) * 180) / Math.PI));
    setG((d) => {
      d.walls.push(createWall(newId('w'), 'Wall', { heading, length: { mm: Math.round(Math.hypot(dx, dy)), certainty: 'estimated' } }));
    });
    toast.info(D.closingAdded);
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:gap-10">
        <div className="flex min-w-0 flex-col gap-9">
          <section>
            <GroupLabel>{D.unitsSource}</GroupLabel>
            <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
              <Field label={D.displayUnit}>
                <Segmented
                  value={unit}
                  onChange={(u: LengthUnit) => updateRoom(room.id, (d) => void (d.displayUnit = u))}
                  options={(['m', 'cm', 'mm'] as LengthUnit[]).map((u) => ({ value: u, label: unitLabel(u) }))}
                />
              </Field>
              <Field label={D.howMeasured}>
                <CommitInput value={g.source} onCommit={(v) => setG((d) => void (d.geometry.source = v))} placeholder={D.howMeasuredPlaceholder} />
              </Field>
            </div>
          </section>

          <section>
            <GroupLabel>{D.shapeSize}</GroupLabel>
            <Segmented
              value={g.shape}
              onChange={switchShape}
              options={[
                { value: 'rectangle', label: t.enums.shape.rectangle },
                { value: 'l-shape', label: t.enums.shape['l-shape'] },
                { value: 'custom', label: t.enums.shape.custom },
              ]}
              ariaLabel={D.roomShape}
              className="mb-5"
            />

            {g.shape !== 'custom' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <MeasureInput
                  live
                  label={g.shape === 'l-shape' ? D.overallLength : D.length}
                  value={g.length}
                  unit={unit}
                  defaultCertainty={defCert}
                  onChange={(m) => setG((d) => void (d.geometry.length = m))}
                />
                <MeasureInput
                  live
                  label={g.shape === 'l-shape' ? D.overallWidth : D.width}
                  value={g.width}
                  unit={unit}
                  defaultCertainty={defCert}
                  onChange={(m) => setG((d) => void (d.geometry.width = m))}
                />
              </div>
            )}
            {g.shape === 'l-shape' && (
              <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <MeasureInput
                  live
                  label={D.cutoutLength}
                  value={g.lCutout.length}
                  unit={unit}
                  defaultCertainty={defCert}
                  onChange={(m) => setG((d) => void (d.geometry.lCutout.length = m))}
                />
                <MeasureInput
                  live
                  label={D.cutoutWidth}
                  value={g.lCutout.width}
                  unit={unit}
                  defaultCertainty={defCert}
                  onChange={(m) => setG((d) => void (d.geometry.lCutout.width = m))}
                />
                <Field label={D.missingCorner}>
                  <CornerPicker value={g.lCutout.corner} onChange={(c) => setG((d) => void (d.geometry.lCutout.corner = c))} />
                </Field>
              </div>
            )}

            {g.shape === 'custom' && (
              <div>
                <p className="mb-3 text-[12px] leading-relaxed text-ink-3">{D.customHelp}</p>
                <div className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
                  {room.walls.map((w, i) => (
                    <div
                      key={w.id}
                      className="grid gap-2 p-3 sm:grid-cols-[28px_minmax(0,1fr)_minmax(0,1.1fr)_150px_auto] sm:items-end"
                      onMouseEnter={() => setHoverWall(w.id)}
                      onMouseLeave={() => setHoverWall(null)}
                    >
                      <span className="pb-2 text-[12px] text-ink-4 tabular">{num(i + 1)}</span>
                      <Field label={D.wallName}>
                        <CommitInput
                          value={wallTitle(w, lang)}
                          onCommit={(v) =>
                            v.trim() !== wallTitle(w, lang) &&
                            setG((d) => void Object.assign(d.walls[i], { name: v.trim() || d.walls[i].name, autoName: !v.trim() }))
                          }
                        />
                      </Field>
                      <MeasureInput live label={D.wallLength} value={w.length} unit={unit} defaultCertainty={defCert} onChange={(m) => setWallLength(i, m)} compact />
                      <Field label={D.direction}>
                        <Select
                          value={HEADINGS.includes(normalizeAngle(w.heading)) ? String(normalizeAngle(w.heading)) : 'custom'}
                          onChange={(e) => e.target.value !== 'custom' && setG((d) => void (d.walls[i].heading = Number(e.target.value)))}
                        >
                          {HEADINGS.map((h) => (
                            <option key={h} value={h}>
                              {D.headings[h]}
                            </option>
                          ))}
                          {!HEADINGS.includes(normalizeAngle(w.heading)) && <option value="custom">{num(Math.round(w.heading))}°</option>}
                        </Select>
                      </Field>
                      <IconButton icon={Trash2} label={D.removeWall} variant="danger" onClick={() => removeWall(i)} className="mb-1" />
                    </div>
                  ))}
                  {room.walls.length === 0 && <div className="p-4 text-[12.5px] text-ink-3">{D.noWalls}</div>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" icon={Plus} onClick={addWall}>
                    {D.addWall}
                  </Button>
                  {shape.drawable && shape.closureGapMm !== null && shape.closureGapMm > 10 && (
                    <Button size="sm" variant="ghost" icon={CornerDownRight} onClick={addClosingWall}>
                      {D.addClosing}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </section>

          <section>
            <GroupLabel>{kind === 'interior' ? D.ceilingGroup : D.heightGroup}</GroupLabel>
            <div className="grid gap-4 sm:grid-cols-2">
              <MeasureInput
                live
                label={kind === 'interior' ? D.ceilingHeight : kind === 'facade' ? D.facadeHeight : D.wallHeight}
                value={room.ceilingHeight}
                unit={unit}
                defaultCertainty={defCert}
                onChange={(m) => setG((d) => void (d.ceilingHeight = m))}
                hint={kind === 'interior' ? D.ceilingHint : D.openAirHint}
              />
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-4 xl:self-start">
          <PlanPreview room={room} height={320} highlightWallId={hoverWall} />
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
            <Metric label={D.floorArea} value={shape.area.mm2 === null ? t.common.unknown : formatArea(shape.area.mm2)} certainty={shape.area.certainty} />
            <Metric label={D.perimeter} value={formatLength(shape.perimeter.mm, unit)} certainty={shape.perimeter.certainty} />
            <Metric
              label={kind === 'interior' ? D.ceilingGroup : D.heightGroup}
              value={formatLength(room.ceilingHeight.mm, unit)}
              certainty={room.ceilingHeight.mm === null ? 'unknown' : room.ceilingHeight.certainty}
            />
            <Metric
              label={D.volume}
              value={kind === 'interior' && shape.area.mm2 !== null && isKnown(room.ceilingHeight) ? formatVolume(shape.area.mm2 * room.ceilingHeight.mm) : '—'}
              certainty={
                shape.area.mm2 !== null && isKnown(room.ceilingHeight)
                  ? shape.area.certainty === 'confirmed' && room.ceilingHeight.certainty === 'confirmed'
                    ? 'confirmed'
                    : 'estimated'
                  : 'unknown'
              }
            />
          </div>
          <IssueList issues={[...shape.issues, ...elIssues]} />
          {!shape.drawable && shape.missing.length > 0 && (
            <Callout tone="neutral" icon={Undo2}>
              {D.missing(shape.missing.join('، '))}
            </Callout>
          )}
        </aside>
      </div>
      <section>
        <GroupLabel>{D.walls}</GroupLabel>
        {shape.segments.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">{D.wallsEmpty}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[620px] text-[12.5px]">
              <thead className="bg-mist/60 text-start text-[11px] uppercase tracking-[0.08em] text-ink-3">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{D.colWall}</th>
                  <th className="px-3 py-2 text-start font-medium">{D.colLength}</th>
                  <th className="px-3 py-2 text-start font-medium">{D.colHeight}</th>
                  <th className="px-3 py-2 text-end font-medium">{D.colGross}</th>
                  <th className="px-3 py-2 text-end font-medium">{D.colNet}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {shape.segments.map((sg, i) => {
                  const row = areas[i];
                  const wallIdx = room.walls.findIndex((w) => w.id === sg.id);
                  const w = room.walls[wallIdx];
                  return (
                    <tr key={sg.id} onMouseEnter={() => setHoverWall(sg.id)} onMouseLeave={() => setHoverWall(null)} className="align-top">
                      <td className="px-3 py-2.5">
                        <CommitInput
                          value={wallTitle(sg, lang)}
                          onCommit={(v) =>
                            wallIdx >= 0 &&
                            v.trim() !== wallTitle(sg, lang) &&
                            setG((d) => {
                              d.walls[wallIdx].name = v.trim() || d.walls[wallIdx].name;
                              d.walls[wallIdx].autoName = !v.trim();
                            })
                          }
                          className="!h-9 max-w-[200px] sm:!h-8"
                          aria-label={D.wallNameAria}
                        />
                      </td>
                      <td className="px-3 py-2.5 tabular">
                        <div className="pt-1.5">
                          {formatLength(sg.length.mm, unit)}
                          {sg.length.certainty === 'estimated' && <span className="ms-1 text-warn">≈</span>}
                        </div>
                        {g.shape !== 'custom' && <div className="text-[11px] text-ink-4">{g.shape === 'rectangle' ? D.fromLw : D.fromL}</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        {w && (
                          <div className="flex flex-col gap-1.5">
                            <Toggle
                              size="sm"
                              checked={!w.heightOverride}
                              onChange={(v) => setG((d) => void (d.walls[wallIdx].heightOverride = !v))}
                              label={<span className="text-[12px]">{D.sameAsCeiling}</span>}
                            />
                            {w.heightOverride && (
                              <MeasureInput
                                compact
                                value={w.height}
                                unit={unit}
                                defaultCertainty={defCert}
                                onChange={(m) => setG((d) => void (d.walls[wallIdx].height = m))}
                              />
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-end tabular">
                        <div className="pt-1.5">{formatArea(row?.grossMm2 ?? null)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-end tabular">
                        <div className="pt-1.5">{formatArea(row?.netMm2 ?? null)}</div>
                        {row && row.unknownOpenings > 0 && <div className="text-[11px] text-warn">{D.unknownOpenings(row.unknownOpenings)}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, certainty }: { label: string; value: string; certainty: 'confirmed' | 'estimated' | 'unknown' }) {
  const t = useT();
  return (
    <div className="bg-surface px-4 py-3">
      <div className="eyebrow">{label}</div>
      <div className="mt-1 text-[17px] text-ink tabular">
        {certainty === 'estimated' && value !== t.common.unknown && value !== '—' ? '≈ ' : ''}
        {value}
      </div>
      <div className={cn('text-[11px]', certainty === 'confirmed' ? 'text-ok' : certainty === 'estimated' ? 'text-warn' : 'text-ink-4')}>
        {certainty === 'confirmed' ? t.dims.confirmed : certainty === 'estimated' ? t.dims.includesEstimates : t.dims.unknown}
      </div>
    </div>
  );
}
