import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { Columns2, Download, Expand, Images, Link2, Pencil, Plus, Search, Sparkles, Tag, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ID, ImageIntent, Reference, ReferenceKind, VersionStatus } from '@/lib/types';
import { REFERENCE_KINDS, VERSION_STATUSES } from '@/lib/labels';
import { useComparison, useComparisons, useReferences, useRooms, useVersions } from '@/lib/hooks/data';
import { addTags, deleteReferences, linkReferences } from '@/lib/db/references';
import { getOriginalBlob } from '@/lib/hooks/useImageUrl';
import { downloadBlob } from '@/lib/download';
import { formatDateTime } from '@/lib/format';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Chip, Input, Select } from '@/components/ui/Form';
import { Menu } from '@/components/ui/Overlay';
import { EmptyState, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { LinkTabs } from '@/components/ui/Tabs';
import { useConfirm } from '@/components/ui/Confirm';
import { Dropzone, usePasteImages } from '@/components/images/Dropzone';
import { useUploadReferences } from '@/components/images/useUpload';
import { ReferenceCard, ReferenceEditor } from '@/components/images/references';
import { useLightbox } from '@/components/images/Lightbox';
import { VersionCard, VersionDetail } from '../versions/VersionDetail';
import { CompareWorkspace, parseItemsParam } from './Compare';

export function DesignLibraryPage() {
  const { tab = 'concepts', itemId } = useParams();
  if (!['concepts', 'references', 'compare'].includes(tab)) return <Navigate to="/library/concepts" replace />;
  return (
    <div>
      <PageHeader
        eyebrow="Bait Khuzam"
        title="Design Library"
        description="Every concept, photo and reference across the house — searchable, linked, and comparable."
      />
      <LinkTabs
        base="/library"
        className="mb-8"
        tabs={[
          { id: 'concepts', label: 'Concepts', icon: Sparkles },
          { id: 'references', label: 'References', icon: Images },
          { id: 'compare', label: 'Compare', icon: Columns2 },
        ]}
      />
      {tab === 'concepts' && <ConceptsTab openId={itemId ?? null} />}
      {tab === 'references' && <ReferencesTab />}
      {tab === 'compare' && <CompareTab comparisonId={itemId ?? null} />}
    </div>
  );
}

function ConceptsTab({ openId }: { openId: string | null }) {
  const versions = useVersions();
  const rooms = useRooms() ?? [];
  const navigate = useNavigate();
  const [room, setRoom] = useState('all');
  const [status, setStatus] = useState<VersionStatus | 'all'>('all');
  const [origin, setOrigin] = useState<'all' | 'generated' | 'imported' | 'prompt-only'>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const list = useMemo(
    () =>
      (versions ?? []).filter(
        (v) =>
          (room === 'all' || v.roomId === room) &&
          (status === 'all' || v.status === status) &&
          (origin === 'all' || v.origin === origin || (origin === 'generated' && v.origin === 'duplicate')),
      ),
    [versions, room, status, origin],
  );
  if (!versions) return <LoadingBlock />;
  const open = versions.find((v) => v.id === openId) ?? null;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={room} onChange={(e) => setRoom(e.target.value)} className="w-[200px]" aria-label="Room">
          <option value="all">All rooms</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as VersionStatus | 'all')} className="w-[170px]" aria-label="Status">
          <option value="all">All statuses</option>
          {VERSION_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select value={origin} onChange={(e) => setOrigin(e.target.value as typeof origin)} className="w-[170px]" aria-label="Origin">
          <option value="all">Generated & imported</option>
          <option value="generated">Generated</option>
          <option value="imported">Imported</option>
          <option value="prompt-only">Prompt only</option>
        </Select>
        {selected.length > 0 && (
          <Button
            variant="primary"
            icon={Columns2}
            className="ml-auto"
            onClick={() => navigate(`/library/compare?items=${selected.map((id) => `ver:${id}`).join(',')}`)}
          >
            Compare {selected.length}
          </Button>
        )}
      </div>
      {versions.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No concepts yet"
          action={
            <ButtonLink to="/studio" variant="primary" icon={Sparkles}>
              Open the Design Studio
            </ButtonLink>
          }
        >
          Generated and imported designs for every room collect here.
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState compact title="No concepts match these filters" />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => (
            <VersionCard
              key={v.id}
              v={v}
              roomName={rooms.find((r) => r.id === v.roomId)?.name}
              onOpen={() => navigate(`/library/concepts/${v.id}`)}
              selected={selected.includes(v.id)}
              onSelect={() => setSelected((s) => (s.includes(v.id) ? s.filter((x) => x !== v.id) : s.length >= 4 ? s : [...s, v.id]))}
            />
          ))}
        </div>
      )}
      <VersionDetail version={open} room={rooms.find((r) => r.id === open?.roomId)} onClose={() => navigate('/library/concepts')} />
    </div>
  );
}

function ReferencesTab() {
  const refs = useReferences();
  const rooms = useRooms() ?? [];
  const [params, setParams] = useSearchParams();
  const lightbox = useLightbox();
  const confirm = useConfirm();
  const { upload, busy } = useUploadReferences();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<ReferenceKind | 'all'>('all');
  const [room, setRoom] = useState<string>('all');
  const [intent, setIntent] = useState<ImageIntent | 'all'>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [uploadKind, setUploadKind] = useState<ReferenceKind>('inspiration');
  const [uploadRoom, setUploadRoom] = useState<string>('');
  const [selected, setSelected] = useState<ID[]>([]);
  const [editing, setEditing] = useState<Reference | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (params.get('upload') === '1') {
      dropRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (dropRef.current?.querySelector('[role="button"]') as HTMLElement | null)?.focus();
      params.delete('upload');
      setParams(params, { replace: true });
    }
    const open = params.get('open');
    if (open && refs) {
      const r = refs.find((x) => x.id === open);
      if (r) setEditing(r);
      params.delete('open');
      setParams(params, { replace: true });
    }
  }, [params, setParams, refs]);

  const doUpload = (files: File[]) => upload(files, { kind: uploadKind, roomIds: uploadRoom ? [uploadRoom] : [] });
  usePasteImages(doUpload);

  const allTags = useMemo(() => Array.from(new Set((refs ?? []).flatMap((r) => r.tags))).sort(), [refs]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (refs ?? []).filter(
      (r) =>
        (kind === 'all' || r.kind === kind) &&
        (room === 'all' ? true : room === 'none' ? r.roomIds.length === 0 : r.roomIds.includes(room) || r.directionRoomIds.includes(room)) &&
        (intent === 'all' || r.intent === intent) &&
        (!tag || r.tags.includes(tag)) &&
        (!needle || [r.title, r.explanation, r.notes, r.source, ...r.tags].join(' ').toLowerCase().includes(needle)),
    );
  }, [refs, q, kind, room, intent, tag]);

  if (!refs) return <LoadingBlock />;

  const bulkDelete = async () => {
    const r = await confirm({
      title: `Delete ${selected.length} image${selected.length > 1 ? 's' : ''}?`,
      tone: 'danger',
      confirmLabel: 'Delete',
      description: 'They are removed everywhere in the project. Design versions that used them keep a copy in their history.',
      typeToConfirm: selected.length > 5 ? 'DELETE' : undefined,
    });
    if (!r.confirmed) return;
    await deleteReferences(selected);
    setSelected([]);
    toast.success('Images deleted');
  };

  return (
    <div className="flex flex-col gap-6">
      <div ref={dropRef} className="grid gap-3 md:grid-cols-[230px_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <Select value={uploadKind} onChange={(e) => setUploadKind(e.target.value as ReferenceKind)} aria-label="Upload as">
            {REFERENCE_KINDS.filter((k) => k.value !== 'generated').map((k) => (
              <option key={k.value} value={k.value}>
                Upload as: {k.label}
              </option>
            ))}
          </Select>
          <Select value={uploadRoom} onChange={(e) => setUploadRoom(e.target.value)} aria-label="Link to room">
            <option value="">Not linked to a room</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                Link to: {r.name}
              </option>
            ))}
          </Select>
          <p className="text-[11.5px] text-ink-3">Paste images anywhere on this page (⌘/Ctrl+V).</p>
        </div>
        <Dropzone onFiles={doUpload} busy={busy} compact label="Drop images here, or click to browse" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-[300px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search captions, notes, tags" className="pl-8" aria-label="Search references" />
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value as ReferenceKind | 'all')} className="w-[170px]" aria-label="Type">
          <option value="all">All types</option>
          {REFERENCE_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
        <Select value={room} onChange={(e) => setRoom(e.target.value)} className="w-[180px]" aria-label="Room">
          <option value="all">All rooms</option>
          <option value="none">Not linked to a room</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        <Select value={intent} onChange={(e) => setIntent(e.target.value as ImageIntent | 'all')} className="w-[150px]" aria-label="Meaning">
          <option value="all">Any meaning</option>
          <option value="want">Want</option>
          <option value="avoid">Avoid</option>
          <option value="neutral">Context</option>
        </Select>
        <span className="ml-auto text-[12px] text-ink-3">
          {list.length} of {refs.length}
        </span>
      </div>
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag size={13} className="text-ink-4" />
          {allTags.map((t) => (
            <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
              {t}
            </Chip>
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-md border border-ink bg-ink px-3 py-2 text-canvas shadow-pop">
          <span className="text-[12.5px]">{selected.length} selected</span>
          <Menu
            align="start"
            trigger={
              <Button size="sm" variant="secondary" icon={Link2}>
                Link to room
              </Button>
            }
            items={rooms.map((r) => ({
              label: r.name,
              onSelect: async () => {
                await linkReferences(selected, 'roomIds', r.id);
                toast.success(`Linked to ${r.name}`);
              },
            }))}
          />
          <form
            className="flex items-center gap-1"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!tagDraft.trim()) return;
              await addTags(selected, tagDraft.split(','));
              setTagDraft('');
              toast.success('Tags added');
            }}
          >
            <Input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="Add tags…" className="!h-8 !w-[150px] text-[12.5px] !text-ink" />
            <Button size="sm" variant="secondary" type="submit" icon={Plus}>
              Tag
            </Button>
          </form>
          <Button size="sm" variant="danger" icon={Trash2} onClick={bulkDelete}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" icon={X} className="ml-auto !text-canvas hover:!bg-white/10" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}

      {refs.length === 0 ? (
        <EmptyState icon={Images} title="The library is empty">
          Upload site photos, plans, inspiration, furniture and material images. Link them to rooms, requirements and walls.
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState compact title="No images match these filters" />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {list.map((r) => (
            <ReferenceCard
              key={r.id}
              reference={r}
              selected={selected.includes(r.id)}
              onToggleSelect={() => setSelected((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))}
              onOpen={() =>
                lightbox(
                  list.map((x) => ({ imageId: x.imageId, title: x.title, description: x.explanation })),
                  list.indexOf(r),
                )
              }
              onEdit={() => setEditing(r)}
              footer={
                r.roomIds.length > 0 ? (
                  <div className="truncate border-t border-line px-3 py-1.5 text-[11px] text-ink-3">
                    {r.roomIds
                      .map((id) => rooms.find((x) => x.id === id)?.name)
                      .filter(Boolean)
                      .join(', ')}
                  </div>
                ) : null
              }
              menu={[
                { label: 'Edit details & links', icon: Pencil, onSelect: () => setEditing(r) },
                { label: 'View full screen', icon: Expand, onSelect: () => lightbox([{ imageId: r.imageId, title: r.title }]) },
                { label: 'Compare', icon: Columns2, onSelect: () => (window.location.hash = `#/library/compare?items=ref:${r.id}`) },
                {
                  label: 'Download original',
                  icon: Download,
                  onSelect: async () => {
                    const o = await getOriginalBlob(r.imageId);
                    if (o) downloadBlob(o.blob, o.name);
                  },
                },
                'separator',
                {
                  label: 'Delete',
                  icon: Trash2,
                  danger: true,
                  onSelect: async () => {
                    const res = await confirm({
                      title: 'Delete this image?',
                      tone: 'danger',
                      confirmLabel: 'Delete',
                      description: 'It is removed everywhere in the project. Versions that used it keep a copy.',
                    });
                    if (res.confirmed) await deleteReferences([r.id]);
                  },
                },
              ]}
            />
          ))}
        </div>
      )}
      <ReferenceEditor reference={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}

function CompareTab({ comparisonId }: { comparisonId: string | null }) {
  const [params] = useSearchParams();
  const comparisons = useComparisons() ?? [];
  const comparison = useComparison(comparisonId);
  const rooms = useRooms() ?? [];
  const items = parseItemsParam(params.get('items'));
  if (comparisonId && comparison === undefined) return <LoadingBlock />;
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_260px]">
      <CompareWorkspace key={comparison?.id ?? params.get('items') ?? 'new'} comparison={comparison ?? null} initialItems={items} />
      <aside>
        <div className="mb-3 flex items-center justify-between">
          <span className="eyebrow">Saved comparisons</span>
          <Link to="/library/compare" className="text-[12px] text-accent hover:underline">
            New
          </Link>
        </div>
        {comparisons.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">Save a comparison to keep its images and notes together.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {comparisons.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/library/compare/${c.id}`}
                  className={`block rounded-md border px-3 py-2 hover:border-line-strong ${c.id === comparisonId ? 'border-ink' : 'border-line'} bg-surface`}
                >
                  <div className="truncate text-[13px]">{c.title}</div>
                  <div className="text-[11px] text-ink-3">
                    {c.items.length} images · {rooms.find((r) => r.id === c.roomId)?.name ?? 'Mixed'} · {formatDateTime(c.updatedAt)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
