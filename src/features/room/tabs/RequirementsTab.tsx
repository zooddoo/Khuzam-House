import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Ban, ChevronDown, ChevronUp, ClipboardList, Copy, GripVertical, ImageIcon, ListPlus, MoreHorizontal, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ID, ImageIntent, Priority, Reference, Requirement, RequirementCategory, RequirementStatus, Room } from '@/lib/types';
import { categoryLabel, PRIORITIES, priorityMeta, REQUIREMENT_CATEGORIES, REQUIREMENT_STATUSES, requirementStatusMeta } from '@/lib/labels';
import { addRequirement, deleteRequirements, duplicateRequirement, reorderRequirements, updateRequirement } from '@/lib/db/requirements';
import { looksLikeExclusion, suggestCategory, suggestPriority } from '@/lib/ai/text/parse';
import { filesFromClipboard } from '@/lib/images/ingest';
import { fileKindOf } from '@/lib/files/kind';
import { fmtDateTime, num } from '@/i18n/format';
import { matchesSearch } from '@/i18n/arabic';
import { useT } from '@/i18n';
import { FileTile } from '@/components/files/FileIcon';
import { EnglishField, NeedsEnglishBadge } from '@/components/translate/EnglishField';
import { ImageThumb } from '@/components/images/ImageThumb';
import { DropTarget, usePasteImages } from '@/components/images/Dropzone';
import { Button, IconButton } from '@/components/ui/Button';
import { CommitInput, Field, Input, Segmented, Select, Textarea } from '@/components/ui/Form';
import { Menu } from '@/components/ui/Overlay';
import { Badge, Dot, EmptyState, Kbd } from '@/components/ui/Display';
import { useConfirm } from '@/components/ui/Confirm';
import { cn } from '@/components/ui/cn';
import { RequirementImages, useAttachToRequirement } from '../requirements/RequirementImages';
import { BulkImportDialog } from '../requirements/BulkImportDialog';

type GroupBy = 'none' | 'category' | 'priority' | 'status' | 'group';

interface Pending {
  id: string;
  file: File;
  url: string;
  caption: string;
  intent: ImageIntent;
}

function splitTitle(text: string): { title: string; description: string } {
  const clean = text.trim();
  const firstLine = clean.split('\n')[0].trim();
  const sentence = firstLine.split(/(?<=[.!?؟])\s+/)[0];
  const title = sentence.length > 100 ? `${sentence.slice(0, 97).trimEnd()}…` : sentence;
  return { title, description: clean.length > title.length + 1 ? clean : '' };
}

function Composer({ room, onAdded }: { room: Room; onAdded: (id: ID) => void }) {
  const t = useT();
  const [text, setText] = useState('');
  const [category, setCategory] = useState<RequirementCategory | 'auto'>('auto');
  const [priority, setPriority] = useState<Priority | 'auto'>('auto');
  const [kind, setKind] = useState<'want' | 'avoid' | 'auto'>('auto');
  const [pending, setPending] = useState<Pending[]>([]);
  const [saving, setSaving] = useState(false);
  const { attach } = useAttachToRequirement(room);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const autoCategory = suggestCategory(text);
  const autoPriority = suggestPriority(text) ?? 'preferred';
  const autoKind = looksLikeExclusion(text) ? 'avoid' : 'want';
  const effCategory = category === 'auto' ? autoCategory : category;
  const effPriority = priority === 'auto' ? autoPriority : priority;
  const effKind = kind === 'auto' ? autoKind : kind;

  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => () => pendingRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const addFiles = (files: File[]) => {
    setPending((p) => [
      ...p,
      ...files.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random()}`,
        file,
        url: URL.createObjectURL(file),
        caption: '',
        intent: (fileKindOf(file.type, file.name) !== 'image' ? 'neutral' : effKind === 'avoid' ? 'avoid' : 'want') as ImageIntent,
      })),
    ]);
  };

  const submit = async () => {
    if (!text.trim()) {
      textRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const { title, description } = splitTitle(text);
      const req = await addRequirement(room.id, { title, description, category: effCategory, priority: effPriority, kind: effKind });
      if (pending.length)
        await attach(
          req,
          pending.map((p) => p.file),
          pending.map((p) => ({ caption: p.caption, intent: p.intent })),
        );
      pending.forEach((p) => URL.revokeObjectURL(p.url));
      setPending([]);
      setText('');
      setCategory('auto');
      setPriority('auto');
      setKind('auto');
      toast.success(t.reqs.added);
      onAdded(req.id);
      textRef.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = filesFromClipboard(e);
    if (!files.length) return;
    if (!e.clipboardData.getData('text/plain')) e.preventDefault();
    addFiles(files);
  };

  return (
    <DropTarget onFiles={addFiles} overlayLabel={t.reqs.dropOnNew} className="rounded-md border border-line bg-surface">
      <div className="p-4">
        <Textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          minRows={2}
          maxRows={10}
          placeholder={t.reqs.composerPlaceholder}
          className="!border-0 !bg-transparent !px-0 !shadow-none !ring-0 !text-[15px]"
          aria-label={t.reqs.newRequirement}
        />
        {pending.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {pending.map((p) => (
              <div key={p.id} className="w-[150px] overflow-hidden rounded-md border border-line bg-raised sm:w-[168px]">
                <div className="relative aspect-[4/3] bg-mist">
                  {fileKindOf(p.file.type, p.file.name) === 'image' ? (
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <FileTile kind={fileKindOf(p.file.type, p.file.name)} ext={p.file.name.split('.').pop()} name={p.file.name} />
                  )}
                  <IconButton
                    icon={X}
                    label={t.reqs.removeFile}
                    size="xs"
                    variant="overlay"
                    className="absolute end-1.5 top-1.5"
                    onClick={() => setPending((ps) => ps.filter((x) => x.id !== p.id))}
                  />
                </div>
                <div className="flex flex-col gap-1.5 p-2">
                  <Input
                    value={p.caption}
                    onChange={(e) => setPending((ps) => ps.map((x) => (x.id === p.id ? { ...x, caption: e.target.value } : x)))}
                    placeholder={t.reqs.captionPlaceholder}
                    className="!h-9 !text-[12.5px] sm:!h-7"
                    aria-label={t.reqs.captionPlaceholder}
                  />
                  <Segmented
                    size="sm"
                    value={p.intent}
                    onChange={(v) => setPending((ps) => ps.map((x) => (x.id === p.id ? { ...x, intent: v } : x)))}
                    options={[
                      { value: 'want', label: t.refs.want },
                      { value: 'avoid', label: t.refs.avoid },
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value as RequirementCategory | 'auto')}
          className="!h-10 w-full !text-[13px] sm:!h-8 sm:w-[210px] sm:!text-[12.5px]"
          aria-label={t.reqs.fieldCategory}
        >
          <option value="auto">{t.reqs.categoryAuto(categoryLabel(autoCategory))}</option>
          {REQUIREMENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <Segmented
          size="sm"
          value={effPriority}
          onChange={(v) => setPriority(v)}
          options={PRIORITIES.map((p) => ({ value: p.value, label: p.short }))}
          ariaLabel={t.reqs.priority}
        />
        <Segmented
          size="sm"
          value={effKind}
          onChange={(v) => setKind(v)}
          options={[
            { value: 'want', label: t.reqs.want },
            { value: 'avoid', label: t.reqs.dontWant },
          ]}
          ariaLabel={t.reqs.wantOrAvoid}
        />
        <label className="touch-target inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm px-2 text-[12.5px] text-ink-2 hover:bg-mist">
          <ImageIcon size={14} />
          {t.reqs.addFiles}
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
        </label>
        <span className="ms-auto hidden items-center gap-1 text-[11.5px] text-ink-4 lg:inline-flex">
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd> {t.reqs.shortcut}
        </span>
        <Button variant="primary" size="sm" icon={Plus} onClick={submit} loading={saving} disabled={!text.trim()} className="ms-auto lg:ms-0">
          {t.reqs.add}
        </Button>
      </div>
    </DropTarget>
  );
}

function RequirementCard({
  room,
  req,
  images,
  expanded,
  onToggle,
  groups,
  dragProps,
  onMove,
}: {
  room: Room;
  req: Requirement;
  images: Reference[];
  expanded: boolean;
  onToggle: () => void;
  groups: string[];
  dragProps?: { draggable: boolean; onDragStart: () => void; onDragOver: (e: DragEvent) => void; onDrop: () => void; dragging: boolean };
  onMove: (dir: -1 | 1) => void;
}) {
  const t = useT();
  const confirm = useConfirm();
  const { attach } = useAttachToRequirement(room);
  const p = priorityMeta(req.priority);
  const st = requirementStatusMeta(req.status);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [expanded]);

  const remove = async () => {
    const r = await confirm({
      title: t.reqs.deleteTitle,
      tone: 'danger',
      confirmLabel: t.reqs.deleteConfirm,
      description: t.reqs.deleteBody(images.length),
    });
    if (r.confirmed) {
      await deleteRequirements([req.id]);
      toast.success(t.reqs.deleted, { description: t.trash.moveHint });
    }
  };

  return (
    <div
      ref={ref}
      onDragOver={dragProps?.onDragOver}
      onDrop={dragProps?.onDrop}
      className={cn(
        'rounded-md border bg-surface transition-shadow',
        expanded ? 'border-line-strong shadow-soft' : 'border-line hover:border-line-strong',
        dragProps?.dragging && 'opacity-40',
      )}
    >
      <DropTarget onFiles={(files) => attach(req, files)} overlayLabel={t.reqs.dropOnExisting(req.title || t.reqs.requirementWord)}>
        <div className="flex items-start gap-2 px-3 py-3">
          {dragProps?.draggable ? (
            <span
              draggable
              onDragStart={dragProps.onDragStart}
              className="mt-0.5 hidden cursor-grab text-ink-4 hover:text-ink-2 active:cursor-grabbing sm:block"
              aria-label={t.reqs.dragToReorder}
              title={t.reqs.dragToReorder}
            >
              <GripVertical size={16} />
            </span>
          ) : (
            <span className="hidden w-4 sm:block" />
          )}
          <span
            className={cn(
              'mt-[7px] h-2 w-2 shrink-0 rounded-full',
              req.priority === 'must' ? 'bg-danger' : req.priority === 'preferred' ? 'bg-accent' : 'bg-ink-4',
            )}
            title={p.label}
          />
          <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-start" aria-expanded={expanded}>
            <div className={cn('text-[14px] leading-snug text-ink', req.status === 'rejected' && 'text-ink-3 line-through')} dir="auto">
              {req.kind === 'avoid' && <Ban size={13} className="-mt-0.5 me-1.5 inline text-danger" aria-label={t.reqs.exclusion} />}
              {req.title || <span className="text-ink-4">{t.reqs.untitled}</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
              <span>{categoryLabel(req.category)}</span>
              <span>{p.label}</span>
              {req.kind === 'avoid' && <span className="text-danger">{t.reqs.exclusion}</span>}
              {req.group && <span dir="auto">{t.reqs.group(req.group)}</span>}
              <NeedsEnglishBadge texts={[req.title, req.description]} />
              {!expanded && req.description && (
                <span className="max-w-[420px] truncate text-ink-4" dir="auto">
                  {req.description}
                </span>
              )}
            </div>
          </button>
          {images.length > 0 && !expanded && (
            <div className="hidden shrink-0 -space-x-2 sm:flex">
              {images.slice(0, 3).map((img) => (
                <ImageThumb key={img.id} imageId={img.imageId} className="h-9 w-9 rounded-sm border-2 border-surface" />
              ))}
              {images.length > 3 && (
                <span className="flex h-9 w-9 items-center justify-center rounded-sm border-2 border-surface bg-mist text-[11px] text-ink-3">
                  +{num(images.length - 3)}
                </span>
              )}
            </div>
          )}
          <Menu
            align="end"
            trigger={
              <button
                type="button"
                className="touch-target inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-2 text-[12px] text-ink-2 hover:bg-mist"
                aria-label={t.reqs.changeStatus}
              >
                <Dot tone={st.tone} /> <span className="hidden md:inline">{st.label}</span> <ChevronDown size={12} />
              </button>
            }
            items={REQUIREMENT_STATUSES.map((s) => ({
              label: s.label,
              hint: s.value === req.status ? t.reqs.current : undefined,
              onSelect: () => updateRequirement(req.id, { status: s.value }),
            }))}
          />
          <Menu
            trigger={<IconButton icon={MoreHorizontal} label={t.reqs.actions} />}
            items={[
              { label: expanded ? t.reqs.collapse : t.reqs.edit, onSelect: onToggle },
              { label: t.common.duplicate, icon: Copy, onSelect: () => duplicateRequirement(req.id) },
              { label: t.reqs.moveUp, icon: ChevronUp, onSelect: () => onMove(-1) },
              { label: t.reqs.moveDown, icon: ChevronDown, onSelect: () => onMove(1) },
              'separator',
              { label: t.common.deleteEllipsis, icon: Trash2, danger: true, onSelect: remove },
            ]}
          />
        </div>

        {expanded && (
          <div className="border-t border-line px-4 pb-4 pt-4 sm:ps-[52px]">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
              <Field label={t.reqs.fieldTitle} className="md:col-span-2">
                <CommitInput value={req.title} onCommit={(v) => updateRequirement(req.id, { title: v })} aria-label={t.reqs.fieldTitle} />
              </Field>
              <EnglishField source={req.title} className="md:col-span-2" compact />
              <Field label={t.reqs.fieldDescription} className="md:col-span-2">
                <CommitInput
                  multiline
                  minRows={2}
                  value={req.description}
                  onCommit={(v) => updateRequirement(req.id, { description: v })}
                  placeholder={t.reqs.descriptionPlaceholder}
                  aria-label={t.reqs.fieldDescription}
                />
              </Field>
              <EnglishField source={req.description} className="md:col-span-2" />
              <Field label={t.reqs.fieldCategory}>
                <Select value={req.category} onChange={(e) => updateRequirement(req.id, { category: e.target.value as RequirementCategory })}>
                  {REQUIREMENT_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.reqs.fieldStatus}>
                <Select value={req.status} onChange={(e) => updateRequirement(req.id, { status: e.target.value as RequirementStatus })}>
                  {REQUIREMENT_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.reqs.fieldPriority}>
                <Segmented
                  value={req.priority}
                  onChange={(v) => updateRequirement(req.id, { priority: v })}
                  options={PRIORITIES.map((x) => ({ value: x.value, label: x.label }))}
                />
              </Field>
              <Field label={t.reqs.fieldType}>
                <Segmented
                  value={req.kind}
                  onChange={(v) => updateRequirement(req.id, { kind: v })}
                  options={[
                    { value: 'want', label: t.reqs.iWant },
                    { value: 'avoid', label: t.reqs.iDontWant },
                  ]}
                />
              </Field>
              <Field label={t.reqs.fieldGroup} hint={t.reqs.groupHint}>
                <GroupInput value={req.group} groups={groups} onCommit={(v) => updateRequirement(req.id, { group: v })} />
              </Field>
              <Field label={t.reqs.fieldSource}>
                <CommitInput
                  value={req.source}
                  onCommit={(v) => updateRequirement(req.id, { source: v })}
                  placeholder={t.reqs.sourcePlaceholder}
                  aria-label={t.reqs.fieldSource}
                />
              </Field>
              <Field label={t.reqs.fieldNotes} className="md:col-span-2">
                <CommitInput multiline minRows={1} value={req.notes} onCommit={(v) => updateRequirement(req.id, { notes: v })} aria-label={t.reqs.fieldNotes} />
              </Field>
            </div>
            <div className="mt-6">
              <RequirementImages room={room} requirement={req} images={images} />
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 text-[11px] text-ink-4">
              <span>{t.reqs.created(fmtDateTime(req.createdAt))}</span>
              <span>{t.reqs.modified(fmtDateTime(req.updatedAt))}</span>
            </div>
          </div>
        )}
      </DropTarget>
    </div>
  );
}

function GroupInput({ value, groups, onCommit }: { value: string; groups: string[]; onCommit: (v: string) => void }) {
  const t = useT();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const id = `groups-${Math.abs(groups.join('|').length)}`;
  return (
    <>
      <Input
        list={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onCommit(draft.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        placeholder={t.reqs.noGroup}
      />
      <datalist id={id}>
        {groups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
    </>
  );
}

export function RequirementsTab({ room, requirements, references }: { room: Room; requirements: Requirement[]; references: Reference[] }) {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [expanded, setExpanded] = useState<ID | null>(params.get('focus'));
  const [q, setQ] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  const [statusFilter, setStatusFilter] = useState<RequirementStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [bulk, setBulk] = useState(false);
  const [dragId, setDragId] = useState<ID | null>(null);
  const { attach } = useAttachToRequirement(room);

  useEffect(() => {
    const f = params.get('focus');
    if (f) {
      setExpanded(f);
      setGroupBy('none');
      params.delete('focus');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  // Pasting images while a requirement is open attaches them to it.
  const expandedReq = requirements.find((r) => r.id === expanded);
  usePasteImages((files) => {
    if (expandedReq) attach(expandedReq, files);
    else toast.info(t.reqs.pasteHint);
  }, true);

  const imagesFor = useMemo(() => {
    const m = new Map<ID, Reference[]>();
    for (const r of references) for (const id of r.requirementIds) m.set(id, [...(m.get(id) ?? []), r]);
    return m;
  }, [references]);

  const groups = useMemo(() => Array.from(new Set(requirements.map((r) => r.group).filter(Boolean))).sort(), [requirements]);

  const filtered = useMemo(() => {
    return requirements.filter(
      (r) =>
        (statusFilter === 'all' || r.status === statusFilter) &&
        (priorityFilter === 'all' || r.priority === priorityFilter) &&
        (!q.trim() || matchesSearch(`${r.title} ${r.description} ${r.notes} ${r.group}`, q)),
    );
  }, [requirements, q, statusFilter, priorityFilter]);

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: '', items: filtered }];
    const order: { key: string; label: string }[] =
      groupBy === 'category'
        ? REQUIREMENT_CATEGORIES.map((c) => ({ key: c.value, label: c.label }))
        : groupBy === 'priority'
          ? PRIORITIES.map((p) => ({ key: p.value, label: p.label }))
          : groupBy === 'status'
            ? REQUIREMENT_STATUSES.map((s) => ({ key: s.value, label: s.label }))
            : [...groups.map((g) => ({ key: g, label: g })), { key: '', label: t.reqs.noGroup }];
    const keyOf = (r: Requirement) => (groupBy === 'category' ? r.category : groupBy === 'priority' ? r.priority : groupBy === 'status' ? r.status : r.group);
    return order.map((o) => ({ ...o, items: filtered.filter((r) => keyOf(r) === o.key) })).filter((g) => g.items.length);
  }, [filtered, groupBy, groups, t]);

  const move = async (id: ID, dir: -1 | 1) => {
    const ids = requirements.map((r) => r.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await reorderRequirements(ids);
  };

  const dropOn = async (targetId: ID) => {
    if (!dragId || dragId === targetId) return;
    const ids = requirements.map((r) => r.id).filter((x) => x !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    setDragId(null);
    await reorderRequirements(ids);
  };

  const counts = {
    must: requirements.filter((r) => r.priority === 'must' && r.status !== 'rejected').length,
    avoid: requirements.filter((r) => r.kind === 'avoid').length,
    images: references.filter((r) => r.requirementIds.length > 0).length,
  };
  const canDrag = groupBy === 'none' && !q && statusFilter === 'all' && priorityFilter === 'all';

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="display text-[28px]">{t.reqs.title}</h2>
            <p className="mt-1 max-w-[640px] text-[12.5px] leading-relaxed text-ink-3">{t.reqs.lead}</p>
          </div>
          <Button icon={ListPlus} onClick={() => setBulk(true)}>
            {t.reqs.pasteMultiple}
          </Button>
        </div>
        <Composer room={room} onAdded={(id) => setExpanded((e) => (e === id ? e : null))} />
      </section>

      <section>
        <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <div className="relative col-span-2 min-w-[200px] flex-1 sm:max-w-[280px]">
            <Search size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.reqs.search} className="ps-8" aria-label={t.reqs.search} />
          </div>
          <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="col-span-2 sm:w-[200px]" aria-label={t.reqs.groupBy}>
            <option value="category">{t.reqs.byCategory}</option>
            <option value="priority">{t.reqs.byPriority}</option>
            <option value="status">{t.reqs.byStatus}</option>
            <option value="group">{t.reqs.byGroup}</option>
            <option value="none">{t.reqs.noGrouping}</option>
          </Select>
          <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as Priority | 'all')} className="sm:w-[150px]" aria-label={t.reqs.filterPriority}>
            <option value="all">{t.reqs.allPriorities}</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as RequirementStatus | 'all')} className="sm:w-[170px]" aria-label={t.reqs.filterStatus}>
            <option value="all">{t.reqs.allStatuses}</option>
            {REQUIREMENT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <div className="col-span-2 flex flex-wrap gap-1.5 text-[12px] text-ink-3 sm:ms-auto">
            <Badge>{t.reqs.total(requirements.length)}</Badge>
            <Badge tone="danger">{t.reqs.must(counts.must)}</Badge>
            {counts.avoid > 0 && <Badge tone="neutral">{t.reqs.exclusions(counts.avoid)}</Badge>}
            <Badge tone="neutral">{t.reqs.files(counts.images)}</Badge>
          </div>
        </div>

        {requirements.length === 0 ? (
          <EmptyState icon={ClipboardList} title={t.reqs.emptyTitle}>
            {t.reqs.emptyBody}
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState compact title={t.reqs.noMatch} />
        ) : (
          <div className="flex flex-col gap-7">
            {grouped.map((g) => (
              <div key={g.key}>
                {g.label && (
                  <div className="mb-2 flex items-center gap-2">
                    <span className="eyebrow">{g.label}</span>
                    <span className="text-[11px] text-ink-4">{num(g.items.length)}</span>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {g.items.map((r) => (
                    <RequirementCard
                      key={r.id}
                      room={room}
                      req={r}
                      images={imagesFor.get(r.id) ?? []}
                      expanded={expanded === r.id}
                      onToggle={() => setExpanded((e) => (e === r.id ? null : r.id))}
                      groups={groups}
                      onMove={(dir) => move(r.id, dir)}
                      dragProps={
                        canDrag
                          ? {
                              draggable: true,
                              dragging: dragId === r.id,
                              onDragStart: () => setDragId(r.id),
                              onDragOver: (e) => {
                                if (dragId) e.preventDefault();
                              },
                              onDrop: () => dropOn(r.id),
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <BulkImportDialog room={room} open={bulk} onOpenChange={setBulk} />
    </div>
  );
}
