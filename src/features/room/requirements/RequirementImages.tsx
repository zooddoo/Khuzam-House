import { useState } from 'react';
import { Library, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ImageAspect, ImageIntent, Reference, Requirement, Room } from '@/lib/types';
import { IMAGE_ASPECTS } from '@/lib/labels';
import { detachFromRequirement, linkReferences, updateReference } from '@/lib/db/references';
import { updateRequirement } from '@/lib/db/requirements';
import { ImageThumb } from '@/components/images/ImageThumb';
import { useLightbox } from '@/components/images/Lightbox';
import { IntentMark, PrimaryStar, ReferencePicker } from '@/components/images/references';
import { UploadButton } from '@/components/images/Dropzone';
import { useUploadReferences } from '@/components/images/useUpload';
import { Button, IconButton } from '@/components/ui/Button';
import { CommitInput, Segmented, Select } from '@/components/ui/Form';
import { useConfirm } from '@/components/ui/Confirm';

export function kindForAspect(aspect: ImageAspect): Reference['kind'] {
  if (aspect === 'furniture') return 'furniture';
  if (aspect === 'material' || aspect === 'color') return 'material';
  return 'inspiration';
}

/** Upload files as attachments of a requirement, keeping the image ↔ requirement relationship. */
export function useAttachToRequirement(room: Room) {
  const { upload, busy } = useUploadReferences();
  const attach = async (req: Requirement, files: File[], meta: { caption?: string; intent?: ImageIntent }[] = []) => {
    const added: Reference[] = [];
    for (let i = 0; i < files.length; i++) {
      const m = meta[i] ?? {};
      const [ref] = await upload(
        [files[i]],
        {
          kind: 'inspiration',
          origin: 'requirement',
          title: m.caption ?? '',
          intent: m.intent ?? (req.kind === 'avoid' ? 'avoid' : 'want'),
          roomIds: [room.id],
          requirementIds: [req.id],
        },
        { quiet: true },
      );
      if (ref) added.push(ref);
    }
    if (added.length) {
      if (!req.primaryReferenceId) await updateRequirement(req.id, { primaryReferenceId: added[0].id });
      toast.success(`${added.length} image${added.length > 1 ? 's' : ''} attached to “${req.title || 'requirement'}”`);
    }
    return added;
  };
  return { attach, busy };
}

export function RequirementImages({ room, requirement, images }: { room: Room; requirement: Requirement; images: Reference[] }) {
  const lightbox = useLightbox();
  const confirm = useConfirm();
  const { attach, busy } = useAttachToRequirement(room);
  const [picker, setPicker] = useState(false);

  const ordered = [...images].sort((a, b) =>
    a.id === requirement.primaryReferenceId ? -1 : b.id === requirement.primaryReferenceId ? 1 : a.createdAt.localeCompare(b.createdAt),
  );

  const remove = async (ref: Reference) => {
    const onlyHere = ref.origin === 'requirement' && ref.requirementIds.length <= 1;
    const r = await confirm({
      title: 'Remove this image?',
      tone: 'danger',
      confirmLabel: 'Remove',
      description: onlyHere
        ? 'It is only attached to this requirement, so it will be deleted. Versions that used it keep their copy.'
        : 'It will be detached from this requirement but stays in the library.',
    });
    if (!r.confirmed) return;
    await detachFromRequirement(ref.id, requirement.id);
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">Images for this requirement</span>
        <div className="flex gap-1.5">
          <UploadButton size="sm" variant="secondary" loading={busy} onFiles={(files) => attach(requirement, files)}>
            Upload
          </UploadButton>
          <Button size="sm" variant="ghost" icon={Library} onClick={() => setPicker(true)}>
            From library
          </Button>
        </div>
      </div>
      {ordered.length === 0 ? (
        <p className="rounded-sm border border-dashed border-line-strong/70 px-3 py-4 text-center text-[12px] text-ink-3">
          Drop, paste (⌘/Ctrl+V) or upload images that illustrate this requirement — what you want, or what you don’t want.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ordered.map((ref) => {
            const primary = ref.id === requirement.primaryReferenceId;
            return (
              <div key={ref.id} className="overflow-hidden rounded-md border border-line bg-raised">
                <ImageThumb
                  imageId={ref.imageId}
                  className="aspect-[4/3] w-full"
                  onClick={() =>
                    lightbox(
                      ordered.map((x) => ({ imageId: x.imageId, title: x.title || requirement.title, description: x.explanation })),
                      ordered.indexOf(ref),
                    )
                  }
                >
                  <div className="absolute left-2 top-2 flex items-center gap-1">
                    <IntentMark intent={ref.intent} />
                    {primary && <span className="rounded-[3px] bg-accent px-1.5 py-0.5 text-[10.5px] font-medium text-white">Primary</span>}
                  </div>
                </ImageThumb>
                <div className="flex flex-col gap-2 p-2.5">
                  <div className="flex items-center gap-1">
                    <CommitInput
                      value={ref.title}
                      onCommit={(v) => updateReference(ref.id, { title: v })}
                      placeholder="Caption"
                      className="!h-8 text-[12.5px]"
                      aria-label="Caption"
                    />
                    <PrimaryStar active={primary} onClick={() => updateRequirement(requirement.id, { primaryReferenceId: primary ? null : ref.id })} />
                    <IconButton icon={Trash2} label="Remove image" size="xs" variant="danger" onClick={() => remove(ref)} />
                  </div>
                  <CommitInput
                    multiline
                    minRows={1}
                    value={ref.explanation}
                    onCommit={(v) => updateReference(ref.id, { explanation: v })}
                    placeholder="What should be taken from this image?"
                    className="text-[12.5px]"
                    aria-label="Explanation"
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Segmented
                      size="sm"
                      value={ref.intent}
                      onChange={(v) => updateReference(ref.id, { intent: v })}
                      options={[
                        { value: 'want', label: 'Want' },
                        { value: 'avoid', label: 'Avoid' },
                        { value: 'neutral', label: 'Context' },
                      ]}
                      ariaLabel="Meaning"
                    />
                    <Select
                      value={ref.aspect}
                      onChange={(e) => {
                        const aspect = e.target.value as ImageAspect;
                        updateReference(ref.id, {
                          aspect,
                          kind: ref.kind === 'inspiration' || ref.kind === 'furniture' || ref.kind === 'material' ? kindForAspect(aspect) : ref.kind,
                        });
                      }}
                      className="!h-7 !w-[118px] !py-0 text-[12px]"
                      aria-label="Illustrates"
                    >
                      {IMAGE_ASPECTS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ReferencePicker
        open={picker}
        onOpenChange={setPicker}
        title={`Attach images to “${requirement.title || 'requirement'}”`}
        preferRoomId={room.id}
        excludeIds={images.map((i) => i.id)}
        uploadDefaults={{ kind: 'inspiration', origin: 'requirement', roomIds: [room.id], intent: requirement.kind === 'avoid' ? 'avoid' : 'want' }}
        onPick={async (ids) => {
          await linkReferences(ids, 'requirementIds', requirement.id);
          await linkReferences(ids, 'roomIds', room.id);
          if (!requirement.primaryReferenceId && ids[0]) await updateRequirement(requirement.id, { primaryReferenceId: ids[0] });
          toast.success(`${ids.length} image${ids.length > 1 ? 's' : ''} attached`);
        }}
      />
    </div>
  );
}
