import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Ban, ChevronDown, ChevronUp, ClipboardList, Copy, GripVertical, ImageIcon, ListPlus, MoreHorizontal, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ID, ImageIntent, Priority, Reference, Requirement, RequirementCategory, RequirementStatus, Room } from '@/lib/types';
import { categoryLabel, PRIORITIES, priorityMeta, REQUIREMENT_CATEGORIES, REQUIREMENT_STATUSES, requirementStatusMeta } from '@/lib/labels';
import { addRequirement, deleteRequirements, duplicateRequirement, reorderRequirements, updateRequirement } from '@/lib/db/requirements';
import { looksLikeExclusion, suggestCategory, suggestPriority } from '@/lib/ai/text/parse';
import { imagesFromClipboard, isAcceptedImage } from '@/lib/images/ingest';
import { formatDateTime } from '@/lib/format';
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
    const ok = files.filter((f) => isAcceptedImage(f));
    if (ok.length < files.length) toast.error('Some files are not supported images and were skipped.');
    setPending((p) => [
      ...p,
      ...ok.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random()}`,
        file,
        url: URL.createObjectURL(file),
        caption: '',
        intent: (effKind === 'avoid' ? 'avoid' : 'want') as ImageIntent,
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
      toast.success('Requirement added');
      onAdded(req.id);
      textRef.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = imagesFromClipboard(e);
    if (!files.length) return;
    if (!e.clipboardData.getData('text/plain')) e.preventDefault();
    addFiles(files);
  };

  return (
    <DropTarget onFiles={addFiles} overlayLabel="Drop images to attach to the new requirement" className="rounded-md border border-line bg-surface">
      <div className="p-4">
        <Textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          minRows={2}
          maxRows={10}
          placeholder="Write a requirement… e.g. “A reading corner beside the window with two chairs and a small table.”"
          className="!border-0 !bg-transparent !px-0 !shadow-none !ring-0 text-[14.5px]"
          aria-label="New requirement"
        />
        {pending.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {pending.map((p) => (
              <div key={p.id} className="w-[168px] overflow-hidden rounded-md border border-line bg-raised">
                <div className="relative aspect-[4/3] bg-mist">
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                  <IconButton
                    icon={X}
                    label="Remove image"
                    size="xs"
                    variant="overlay"
                    className="absolute right-1.5 top-1.5"
                    onClick={() => setPending((ps) => ps.filter((x) => x.id !== p.id))}
                  />
                </div>
                <div className="flex flex-col gap-1.5 p-2">
                  <Input
                    value={p.caption}
                    onChange={(e) => setPending((ps) => ps.map((x) => (x.id === p.id ? { ...x, caption: e.target.value } : x)))}
                    placeholder="Caption"
                    className="!h-7 text-[12px]"
                    aria-label="Caption"
                  />
                  <Segmented
                    size="sm"
                    value={p.intent}
                    onChange={(v) => setPending((ps) => ps.map((x) => (x.id === p.id ? { ...x, intent: v } : x)))}
                    options={[
                      { value: 'want', label: 'Want' },
                      { value: 'avoid', label: 'Avoid' },
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
          className="!h-8 w-[200px] text-[12.5px]"
          aria-label="Category"
        >
          <option value="auto">Category: {categoryLabel(autoCategory)} (auto)</option>
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
          ariaLabel="Priority"
        />
        <Segmented
          size="sm"
          value={effKind}
          onChange={(v) => setKind(v)}
          options={[
            { value: 'want', label: 'Want' },
            { value: 'avoid', label: 'Don’t want' },
          ]}
          ariaLabel="Want or exclusion"
        />
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm px-2 text-[12.5px] text-ink-2 hover:bg-mist">
          <ImageIcon size={14} />
          Add images
          <input
            type="file"
            multiple
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
        </label>
        <span className="ml-auto hidden items-center gap-1 text-[11.5px] text-ink-4 sm:inline-flex">
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd> to add · paste or drop images
        </span>
        <Button variant="primary" size="sm" icon={Plus} onClick={submit} loading={saving} disabled={!text.trim()}>
          Add requirement
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
      title: 'Delete this requirement?',
      tone: 'danger',
      confirmLabel: 'Delete',
      description: images.length ? `Its ${images.length} attached image(s) will be removed unless they are used elsewhere.` : 'This cannot be undone.',
    });
    if (r.confirmed) {
      await deleteRequirements([req.id]);
      toast.success('Requirement deleted');
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
      <DropTarget onFiles={(files) => attach(req, files)} overlayLabel={`Drop to attach to “${req.title || 'requirement'}”`}>
        <div className="flex items-start gap-2 px-3 py-3">
          {dragProps?.draggable ? (
            <span
              draggable
              onDragStart={dragProps.onDragStart}
              className="mt-0.5 cursor-grab text-ink-4 hover:text-ink-2 active:cursor-grabbing"
              aria-label="Drag to reorder"
              title="Drag to reorder"
            >
              <GripVertical size={16} />
            </span>
          ) : (
            <span className="w-4" />
          )}
          <span
            className={cn(
              'mt-[7px] h-2 w-2 shrink-0 rounded-full',
              req.priority === 'must' ? 'bg-danger' : req.priority === 'preferred' ? 'bg-accent' : 'bg-ink-4',
            )}
            title={p.label}
          />
          <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={expanded}>
            <div className={cn('text-[14px] leading-snug text-ink', req.status === 'rejected' && 'text-ink-3 line-through')} dir="auto">
              {req.kind === 'avoid' && <Ban size={13} className="-mt-0.5 mr-1.5 inline text-danger" aria-label="Exclusion" />}
              {req.title || <span className="text-ink-4">Untitled requirement</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
              <span>{categoryLabel(req.category)}</span>
              <span>{p.label}</span>
              {req.kind === 'avoid' && <span className="text-danger">Exclusion</span>}
              {req.group && <span>Group: {req.group}</span>}
              {!expanded && req.description && <span className="max-w-[420px] truncate text-ink-4">{req.description}</span>}
            </div>
          </button>
          {images.length > 0 && !expanded && (
            <div className="hidden shrink-0 -space-x-2 sm:flex">
              {images.slice(0, 3).map((img) => (
                <ImageThumb key={img.id} imageId={img.imageId} className="h-9 w-9 rounded-sm border-2 border-surface" />
              ))}
              {images.length > 3 && (
                <span className="flex h-9 w-9 items-center justify-center rounded-sm border-2 border-surface bg-mist text-[11px] text-ink-3">
                  +{images.length - 3}
                </span>
              )}
            </div>
          )}
          <Menu
            align="end"
            trigger={
              <button
                type="button"
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-2 text-[12px] text-ink-2 hover:bg-mist"
                aria-label="Change requirement status"
              >
                <Dot tone={st.tone} /> <span className="hidden md:inline">{st.label}</span> <ChevronDown size={12} />
              </button>
            }
            items={REQUIREMENT_STATUSES.map((s) => ({
              label: s.label,
              hint: s.value === req.status ? 'current' : undefined,
              onSelect: () => updateRequirement(req.id, { status: s.value }),
            }))}
          />
          <Menu
            trigger={<IconButton icon={MoreHorizontal} label="Requirement actions" />}
            items={[
              { label: expanded ? 'Collapse' : 'Edit', onSelect: onToggle },
              { label: 'Duplicate', icon: Copy, onSelect: () => duplicateRequirement(req.id) },
              { label: 'Move up', icon: ChevronUp, onSelect: () => onMove(-1) },
              { label: 'Move down', icon: ChevronDown, onSelect: () => onMove(1) },
              'separator',
              { label: 'Delete', icon: Trash2, danger: true, onSelect: remove },
            ]}
          />
        </div>

        {expanded && (
          <div className="border-t border-line px-4 pb-4 pt-4 sm:pl-[52px]">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Title" className="md:col-span-2">
                <CommitInput value={req.title} onCommit={(v) => updateRequirement(req.id, { title: v })} aria-label="Title" />
              </Field>
              <Field label="Detailed description" className="md:col-span-2">
                <CommitInput
                  multiline
                  minRows={2}
                  value={req.description}
                  onCommit={(v) => updateRequirement(req.id, { description: v })}
                  placeholder="Details, measurements, preferences…"
                  aria-label="Description"
                />
              </Field>
              <Field label="Category">
                <Select value={req.category} onChange={(e) => updateRequirement(req.id, { category: e.target.value as RequirementCategory })}>
                  {REQUIREMENT_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={req.status} onChange={(e) => updateRequirement(req.id, { status: e.target.value as RequirementStatus })}>
                  {REQUIREMENT_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority">
                <Segmented
                  value={req.priority}
                  onChange={(v) => updateRequirement(req.id, { priority: v })}
                  options={PRIORITIES.map((x) => ({ value: x.value, label: x.label }))}
                />
              </Field>
              <Field label="Type">
                <Segmented
                  value={req.kind}
                  onChange={(v) => updateRequirement(req.id, { kind: v })}
                  options={[
                    { value: 'want', label: 'I want this' },
                    { value: 'avoid', label: 'I don’t want this' },
                  ]}
                />
              </Field>
              <Field label="Group" hint="Optional, e.g. “Reading corner” or “TV wall”.">
                <GroupInput value={req.group} groups={groups} onCommit={(v) => updateRequirement(req.id, { group: v })} />
              </Field>
              <Field label="Source">
                <CommitInput
                  value={req.source}
                  onCommit={(v) => updateRequirement(req.id, { source: v })}
                  placeholder="e.g. Family discussion, magazine, designer"
                  aria-label="Source"
                />
              </Field>
              <Field label="Notes" className="md:col-span-2">
                <CommitInput multiline minRows={1} value={req.notes} onCommit={(v) => updateRequirement(req.id, { notes: v })} aria-label="Notes" />
              </Field>
            </div>
            <div className="mt-6">
              <RequirementImages room={room} requirement={req} images={images} />
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 text-[11px] text-ink-4">
              <span>Created {formatDateTime(req.createdAt)}</span>
              <span>Modified {formatDateTime(req.updatedAt)}</span>
            </div>
          </div>
        )}
      </DropTarget>
    </div>
  );
}

function GroupInput({ value, groups, onCommit }: { value: string; groups: string[]; onCommit: (v: string) => void }) {
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
        placeholder="No group"
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
    else toast.info('Open a requirement (or click into the new-requirement box) to paste images into it.');
  }, true);

  const imagesFor = useMemo(() => {
    const m = new Map<ID, Reference[]>();
    for (const r of references) for (const id of r.requirementIds) m.set(id, [...(m.get(id) ?? []), r]);
    return m;
  }, [references]);

  const groups = useMemo(() => Array.from(new Set(requirements.map((r) => r.group).filter(Boolean))).sort(), [requirements]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return requirements.filter(
      (r) =>
        (statusFilter === 'all' || r.status === statusFilter) &&
        (priorityFilter === 'all' || r.priority === priorityFilter) &&
        (!needle || `${r.title} ${r.description} ${r.notes} ${r.group}`.toLowerCase().includes(needle)),
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
            : [...groups.map((g) => ({ key: g, label: g })), { key: '', label: 'No group' }];
    const keyOf = (r: Requirement) => (groupBy === 'category' ? r.category : groupBy === 'priority' ? r.priority : groupBy === 'status' ? r.status : r.group);
    return order.map((o) => ({ ...o, items: filtered.filter((r) => keyOf(r) === o.key) })).filter((g) => g.items.length);
  }, [filtered, groupBy, groups]);

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
            <h2 className="display text-[28px]">Requirements</h2>
            <p className="mt-1 max-w-[640px] text-[12.5px] leading-relaxed text-ink-3">
              Your requirements are the primary input for every design of this room. Images stay attached to the requirement they illustrate.
            </p>
          </div>
          <Button icon={ListPlus} onClick={() => setBulk(true)}>
            Paste multiple
          </Button>
        </div>
        <Composer room={room} onAdded={(id) => setExpanded((e) => (e === id ? e : null))} />
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-[280px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search requirements" className="pl-8" aria-label="Search requirements" />
          </div>
          <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="w-[170px]" aria-label="Group by">
            <option value="category">Group by category</option>
            <option value="priority">Group by priority</option>
            <option value="status">Group by status</option>
            <option value="group">Group by custom group</option>
            <option value="none">No grouping (manual order)</option>
          </Select>
          <Select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as Priority | 'all')}
            className="w-[150px]"
            aria-label="Filter priority"
          >
            <option value="all">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RequirementStatus | 'all')}
            className="w-[170px]"
            aria-label="Filter status"
          >
            <option value="all">All statuses</option>
            {REQUIREMENT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <div className="ml-auto flex flex-wrap gap-1.5 text-[12px] text-ink-3">
            <Badge>{requirements.length} total</Badge>
            <Badge tone="danger">{counts.must} must</Badge>
            {counts.avoid > 0 && <Badge tone="neutral">{counts.avoid} exclusions</Badge>}
            <Badge tone="neutral">{counts.images} images</Badge>
          </div>
        </div>

        {requirements.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No requirements yet">
            Write your first requirement above, or use <strong>Paste multiple</strong> to import a list. Attach photos of furniture, materials or details you
            like — or don't.
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState compact title="No requirements match the filters" />
        ) : (
          <div className="flex flex-col gap-7">
            {grouped.map((g) => (
              <div key={g.key}>
                {g.label && (
                  <div className="mb-2 flex items-center gap-2">
                    <span className="eyebrow">{g.label}</span>
                    <span className="text-[11px] text-ink-4">{g.items.length}</span>
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
