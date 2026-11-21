import { useState } from 'react';
import { Copy, Eraser, Library, Lightbulb, Link2Off, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DesignDirectionFields, DirectionPreset, Reference, Room } from '@/lib/types';
import { usePresets, useRooms, useSettings } from '@/lib/hooks/data';
import { updateRoom } from '@/lib/db/rooms';
import { directionIsEmpty, emptyDirection } from '@/lib/db/factories';
import { linkReferences, unlinkReferences } from '@/lib/db/references';
import { nowIso } from '@/lib/ids';
import { fmtDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n';
import { presetDisplayName, presetSummary, roomDisplayName } from '@/lib/names';
import { PickerButtons } from '@/components/images/Dropzone';
import { ImageThumb } from '@/components/images/ImageThumb';
import { useLightbox } from '@/components/images/Lightbox';
import { IntentMark, ReferencePicker } from '@/components/images/references';
import { UploadButton } from '@/components/images/Dropzone';
import { useUploadReferences } from '@/components/images/useUpload';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Form';
import { Menu } from '@/components/ui/Overlay';
import { Callout, GroupLabel } from '@/components/ui/Display';
import { useConfirm } from '@/components/ui/Confirm';
import { DirectionFieldsEditor } from '../direction/DirectionFields';
import { PaletteStrip, PresetManager } from '../direction/PresetManager';

function pickFields(d: DesignDirectionFields): DesignDirectionFields {
  const { style, atmosphere, palette, paletteNotes, materials, woodType, flooring, wallFinishes, furnitureStyle, lighting, curtains, description, avoid } = d;
  return structuredClone({
    style,
    atmosphere,
    palette,
    paletteNotes,
    materials,
    woodType,
    flooring,
    wallFinishes,
    furnitureStyle,
    lighting,
    curtains,
    description,
    avoid,
  });
}

function mergeEmpty(current: DesignDirectionFields, incoming: DesignDirectionFields): DesignDirectionFields {
  const out = { ...current };
  (Object.keys(incoming) as (keyof DesignDirectionFields)[]).forEach((k) => {
    if (k === 'palette') {
      if (!out.palette.length) out.palette = structuredClone(incoming.palette);
    } else if (!String(out[k]).trim()) {
      (out as Record<string, unknown>)[k] = incoming[k];
    }
  });
  return out;
}

export function DirectionTab({ room, references }: { room: Room; references: Reference[] }) {
  const { t, lang } = useI18n();
  const D = t.direction;
  const roomName = roomDisplayName(room, lang);
  const presets = usePresets() ?? [];
  const rooms = useRooms() ?? [];
  const settings = useSettings();
  const confirm = useConfirm();
  const lightbox = useLightbox();
  const { upload, busy } = useUploadReferences();
  const [manager, setManager] = useState(false);
  const [picker, setPicker] = useState(false);
  const d = room.direction;
  const empty = directionIsEmpty(d);
  const directionRefs = references.filter((r) => r.directionRoomIds.includes(room.id));

  const patch = (p: Partial<DesignDirectionFields>) =>
    updateRoom(room.id, (draft) => {
      Object.assign(draft.direction, p);
      draft.direction.updatedAt = nowIso();
    });

  const applyFields = async (fields: DesignDirectionFields, source: { presetId?: string | null; presetName: string }) => {
    let mode: 'replace' | 'fill' = 'replace';
    if (!empty) {
      const r = await confirm({
        title: D.applyTitle(source.presetName, roomName),
        description: D.applyBody,
        confirmLabel: D.apply,
        checkbox: { label: D.onlyFillEmpty, defaultChecked: true },
      });
      if (!r.confirmed) return;
      mode = r.checked ? 'fill' : 'replace';
    }
    await updateRoom(room.id, (draft) => {
      const next = mode === 'fill' ? mergeEmpty(pickFields(draft.direction), fields) : pickFields(fields);
      draft.direction = { ...draft.direction, ...next, presetId: source.presetId ?? null, presetName: source.presetName, updatedAt: nowIso() };
    });
    toast.success(D.applied(source.presetName), { description: D.appliedHint });
  };

  const adoptConcept = async () => {
    await updateRoom(room.id, (draft) => {
      const text = (lang === 'ar' && draft.preliminaryConceptAr ? draft.preliminaryConceptAr : draft.preliminaryConcept).trim();
      draft.direction.description = draft.direction.description.trim() ? `${draft.direction.description.trim()}\n\n${text}` : text;
      draft.direction.updatedAt = nowIso();
      draft.preliminaryConcept = '';
      draft.preliminaryConceptAr = '';
    });
    toast.success(D.ideaAdded, { description: D.ideaAddedHint });
  };

  const dismissConcept = async () => {
    const r = await confirm({ title: D.removeIdeaTitle, description: D.removeIdeaBody, confirmLabel: D.removeNote, tone: 'danger' });
    if (r.confirmed)
      await updateRoom(room.id, (draft) => {
        draft.preliminaryConcept = '';
        draft.preliminaryConceptAr = '';
      });
  };

  const clearAll = async () => {
    const r = await confirm({ title: D.clearTitle, tone: 'danger', confirmLabel: D.clear, description: D.clearBody });
    if (r.confirmed) await updateRoom(room.id, (draft) => void (draft.direction = emptyDirection()));
  };

  const otherRooms = rooms.filter((r) => r.id !== room.id && !directionIsEmpty(r.direction));

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="display text-[28px]">{D.title}</h2>
          <p className="mt-1 max-w-[680px] text-[12.5px] leading-relaxed text-ink-3">
            {D.leadPrefix}
            {d.updatedAt && D.lastChanged(fmtDateTime(d.updatedAt))}
            {d.presetName && D.startedFrom(d.presetName)}
          </p>
          <p className="mt-1 max-w-[680px] text-[11.5px] leading-relaxed text-ink-4">{D.englishNote}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {otherRooms.length > 0 && (
            <Menu
              trigger={
                <Button size="sm" icon={Copy}>
                  {D.copyFrom}
                </Button>
              }
              items={otherRooms.map((r) => ({
                label: roomDisplayName(r, lang),
                hint: r.direction.style,
                onSelect: () => applyFields(r.direction, { presetName: D.roomsDirection(roomDisplayName(r, lang)) }),
              }))}
            />
          )}
          <Button size="sm" icon={Settings2} onClick={() => setManager(true)}>
            {D.managePresets}
          </Button>
          {!empty && (
            <Button size="sm" variant="ghost" icon={Eraser} onClick={clearAll}>
              {D.clear}
            </Button>
          )}
        </div>
      </div>

      {room.preliminaryConcept && (
        <Callout
          tone="neutral"
          icon={Lightbulb}
          title={D.ideaTitle}
          action={
            <>
              <Button size="sm" onClick={adoptConcept}>
                {D.useAsStart}
              </Button>
              <Button size="sm" variant="ghost" onClick={dismissConcept}>
                {D.removeNote}
              </Button>
            </>
          }
        >
          <p className="text-[13px] text-ink" dir="auto">
            {t.common.quoted(lang === 'ar' && room.preliminaryConceptAr ? room.preliminaryConceptAr : room.preliminaryConcept)}
          </p>
          <p className="mt-1">{D.ideaBody}</p>
        </Callout>
      )}

      <section>
        <GroupLabel>{D.startFromPreset}</GroupLabel>
        <div className="scroll-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {presets.map((p: DirectionPreset) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyFields(p.fields, { presetId: p.id, presetName: presetDisplayName(p, lang) })}
              className="flex w-[180px] shrink-0 flex-col gap-2.5 rounded-md border border-line bg-surface p-3 text-start transition-shadow hover:border-line-strong hover:shadow-soft sm:w-[200px]"
            >
              <PaletteStrip fields={p.fields} className="h-10 !rounded-sm" />
              <div>
                <div className="text-[13.5px] text-ink" dir="auto">
                  {presetDisplayName(p, lang)}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-ink-3" dir="auto">
                  {presetSummary(p, lang)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <GroupLabel>{D.directionFor(roomName)}</GroupLabel>
        <DirectionFieldsEditor value={d} onChange={patch} />
      </section>

      <section>
        <GroupLabel
          actions={
            <div className="flex gap-1.5">
              <span className="hidden sm:inline-flex">
                <UploadButton
                  size="xs"
                  imagesOnly
                  loading={busy}
                  onFiles={(files) => upload(files, { kind: 'inspiration', roomIds: [room.id], directionRoomIds: [room.id], intent: 'want' })}
                >
                  {D.upload}
                </UploadButton>
              </span>
              <Button size="xs" variant="ghost" icon={Library} onClick={() => setPicker(true)}>
                {D.fromLibrary}
              </Button>
            </div>
          }
        >
          {D.refImages}
        </GroupLabel>
        <PickerButtons
          imagesOnly
          className="mb-3 sm:hidden"
          disabled={busy}
          onFiles={(files) => void upload(files, { kind: 'inspiration', roomIds: [room.id], directionRoomIds: [room.id], intent: 'want' })}
        />
        {directionRefs.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-strong/70 px-4 py-6 text-center text-[12.5px] text-ink-3">{D.refEmpty}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {directionRefs.map((r) => (
              <div key={r.id} className="group relative">
                <ImageThumb
                  imageId={r.imageId}
                  className="aspect-[4/5] w-full rounded-md border border-line"
                  onClick={() =>
                    lightbox(
                      directionRefs.map((x) => ({ imageId: x.imageId, title: x.title, description: x.explanation })),
                      directionRefs.indexOf(r),
                    )
                  }
                >
                  <IntentMark intent={r.intent} className="absolute start-2 top-2" />
                </ImageThumb>
                <IconButton
                  icon={Link2Off}
                  label={D.removeFromDirection}
                  size="xs"
                  variant="overlay"
                  className="absolute end-2 top-2 opacity-100 group-hover:opacity-100 focus:opacity-100 sm:opacity-0"
                  onClick={() => unlinkReferences([r.id], 'directionRoomIds', room.id)}
                />
                {r.title && (
                  <div className="mt-1.5 truncate text-[12px] text-ink-2" dir="auto">
                    {r.title}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-md border border-line bg-surface p-4">
        <Toggle
          checked={room.useHouseGuidelines}
          onChange={(v) => updateRoom(room.id, (draft) => void (draft.useHouseGuidelines = v))}
          label={D.houseToggle}
          description={
            settings?.houseGuidelines.trim()
              ? D.houseOn(`${settings.houseGuidelines.trim().slice(0, 140)}${settings.houseGuidelines.trim().length > 140 ? '…' : ''}`)
              : D.houseNone
          }
        />
        {!settings?.houseGuidelines.trim() && (
          <ButtonLink to="/settings" size="xs" variant="ghost" className="mt-2">
            {D.openSettings}
          </ButtonLink>
        )}
      </section>

      <PresetManager open={manager} onOpenChange={setManager} seed={empty ? null : pickFields(d)} />
      <ReferencePicker
        open={picker}
        onOpenChange={setPicker}
        title={D.refImages}
        imagesOnly
        preferRoomId={room.id}
        excludeIds={directionRefs.map((r) => r.id)}
        uploadDefaults={{ kind: 'inspiration', roomIds: [room.id], directionRoomIds: [room.id], intent: 'want' }}
        onPick={async (ids) => {
          await linkReferences(ids, 'directionRoomIds', room.id);
          await linkReferences(ids, 'roomIds', room.id);
        }}
      />
    </div>
  );
}
