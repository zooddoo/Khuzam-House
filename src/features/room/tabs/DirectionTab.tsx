import { useState } from 'react';
import { Copy, Eraser, Library, Lightbulb, Link2Off, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DesignDirectionFields, DirectionPreset, Reference, Room } from '@/lib/types';
import { usePresets, useRooms, useSettings } from '@/lib/hooks/data';
import { updateRoom } from '@/lib/db/rooms';
import { directionIsEmpty, emptyDirection } from '@/lib/db/factories';
import { linkReferences, unlinkReferences } from '@/lib/db/references';
import { nowIso } from '@/lib/ids';
import { formatDateTime } from '@/lib/format';
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
        title: `Apply “${source.presetName}” to ${room.name}?`,
        description:
          'This room already has a direction. Untick the box to replace every field; leave it ticked to fill only the empty ones. Other rooms are not affected.',
        confirmLabel: 'Apply',
        checkbox: { label: 'Only fill empty fields (keep what I wrote)', defaultChecked: true },
      });
      if (!r.confirmed) return;
      mode = r.checked ? 'fill' : 'replace';
    }
    await updateRoom(room.id, (draft) => {
      const next = mode === 'fill' ? mergeEmpty(pickFields(draft.direction), fields) : pickFields(fields);
      draft.direction = { ...draft.direction, ...next, presetId: source.presetId ?? null, presetName: source.presetName, updatedAt: nowIso() };
    });
    toast.success(`Applied ${source.presetName}`, { description: 'Edit any field — the preset itself is unchanged.' });
  };

  const adoptConcept = async () => {
    await updateRoom(room.id, (draft) => {
      const text = draft.preliminaryConcept.trim();
      draft.direction.description = draft.direction.description.trim() ? `${draft.direction.description.trim()}\n\n${text}` : text;
      draft.direction.updatedAt = nowIso();
      draft.preliminaryConcept = '';
    });
    toast.success('Earlier idea added to the description', { description: 'Refine it in the fields below.' });
  };

  const dismissConcept = async () => {
    const r = await confirm({
      title: 'Remove the earlier idea?',
      description: 'The note will be deleted from this room. It has never been used in designs.',
      confirmLabel: 'Remove note',
      tone: 'danger',
    });
    if (r.confirmed) await updateRoom(room.id, (draft) => void (draft.preliminaryConcept = ''));
  };

  const clearAll = async () => {
    const r = await confirm({
      title: 'Clear this room’s direction?',
      tone: 'danger',
      confirmLabel: 'Clear',
      description: 'All direction fields for this room are emptied. Reference images stay in the library.',
    });
    if (r.confirmed) await updateRoom(room.id, (draft) => void (draft.direction = emptyDirection()));
  };

  const otherRooms = rooms.filter((r) => r.id !== room.id && !directionIsEmpty(r.direction));

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="display text-[28px]">Design direction</h2>
          <p className="mt-1 max-w-[680px] text-[12.5px] leading-relaxed text-ink-3">
            The style for <strong className="text-ink-2">this room only</strong>. Every field is optional — use a preset as a starting point, write your own, or
            rely on images.
            {d.updatedAt && <> Last changed {formatDateTime(d.updatedAt)}.</>}
            {d.presetName && <> Started from “{d.presetName}”.</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {otherRooms.length > 0 && (
            <Menu
              trigger={
                <Button size="sm" icon={Copy}>
                  Copy from another room
                </Button>
              }
              items={otherRooms.map((r) => ({
                label: r.name,
                hint: r.direction.style,
                onSelect: () => applyFields(r.direction, { presetName: `${r.name}'s direction` }),
              }))}
            />
          )}
          <Button size="sm" icon={Settings2} onClick={() => setManager(true)}>
            Manage presets
          </Button>
          {!empty && (
            <Button size="sm" variant="ghost" icon={Eraser} onClick={clearAll}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {room.preliminaryConcept && (
        <Callout
          tone="neutral"
          icon={Lightbulb}
          title="Earlier conceptual idea — not applied"
          action={
            <>
              <Button size="sm" onClick={adoptConcept}>
                Use as starting point
              </Button>
              <Button size="sm" variant="ghost" onClick={dismissConcept}>
                Remove note
              </Button>
            </>
          }
        >
          <p className="text-[13px] text-ink">“{room.preliminaryConcept}”</p>
          <p className="mt-1">From earlier discussions in the project brief. It is not a confirmed decision and is not sent to the AI unless you adopt it.</p>
        </Callout>
      )}

      <section>
        <GroupLabel>Start from a preset</GroupLabel>
        <div className="scroll-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {presets.map((p: DirectionPreset) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyFields(p.fields, { presetId: p.id, presetName: p.name })}
              className="flex w-[200px] shrink-0 flex-col gap-2.5 rounded-md border border-line bg-surface p-3 text-left transition-shadow hover:border-line-strong hover:shadow-soft"
            >
              <PaletteStrip fields={p.fields} className="h-10 !rounded-sm" />
              <div>
                <div className="text-[13.5px] text-ink">{p.name}</div>
                <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-ink-3">{p.summary}</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <GroupLabel>Direction for {room.name}</GroupLabel>
        <DirectionFieldsEditor value={d} onChange={patch} />
      </section>

      <section>
        <GroupLabel
          actions={
            <div className="flex gap-1.5">
              <UploadButton
                size="xs"
                loading={busy}
                onFiles={(files) => upload(files, { kind: 'inspiration', roomIds: [room.id], directionRoomIds: [room.id], intent: 'want' })}
              >
                Upload
              </UploadButton>
              <Button size="xs" variant="ghost" icon={Library} onClick={() => setPicker(true)}>
                From library
              </Button>
            </div>
          }
        >
          Direction reference images
        </GroupLabel>
        {directionRefs.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-strong/70 px-4 py-6 text-center text-[12.5px] text-ink-3">
            Mood images for this room’s style. Mark an image “Avoid” to show a look you don’t want.
          </p>
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
                  <IntentMark intent={r.intent} className="absolute left-2 top-2" />
                </ImageThumb>
                <IconButton
                  icon={Link2Off}
                  label="Remove from direction"
                  size="xs"
                  variant="overlay"
                  className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 focus:opacity-100"
                  onClick={() => unlinkReferences([r.id], 'directionRoomIds', room.id)}
                />
                {r.title && <div className="mt-1.5 truncate text-[12px] text-ink-2">{r.title}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-md border border-line bg-surface p-4">
        <Toggle
          checked={room.useHouseGuidelines}
          onChange={(v) => updateRoom(room.id, (draft) => void (draft.useHouseGuidelines = v))}
          label="Also apply the house-wide guidelines to this room"
          description={
            settings?.houseGuidelines.trim()
              ? `Off by default. When on, these guidelines are added to this room's prompts: “${settings.houseGuidelines.trim().slice(0, 140)}${settings.houseGuidelines.trim().length > 140 ? '…' : ''}”`
              : 'Off by default. No house-wide guidelines are written yet — add them in Settings if you ever want shared rules.'
          }
        />
        {!settings?.houseGuidelines.trim() && (
          <ButtonLink to="/settings" size="xs" variant="ghost" className="mt-2">
            Open Settings
          </ButtonLink>
        )}
      </section>

      <PresetManager open={manager} onOpenChange={setManager} seed={empty ? null : pickFields(d)} />
      <ReferencePicker
        open={picker}
        onOpenChange={setPicker}
        title="Direction reference images"
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
