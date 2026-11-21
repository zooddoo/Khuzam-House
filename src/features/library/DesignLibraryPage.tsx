import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { Columns2, Download, Expand, Images, Link2, Pencil, Plus, Search, Sparkles, Tag, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { FileKind, ID, ImageIntent, Reference, ReferenceKind, VersionStatus } from '@/lib/types';
import { REFERENCE_KINDS, referenceKindLabel as referenceKindName, VERSION_STATUSES } from '@/lib/labels';
import { useComparison, useComparisons, useFilesMap, useReferences, useRooms, useVersions } from '@/lib/hooks/data';
import { addTags, deleteReferences, linkReferences } from '@/lib/db/references';
import { getOriginalBlob } from '@/lib/hooks/useImageUrl';
import { downloadBlob } from '@/lib/download';
import { fmtDateTime } from '@/i18n/format';
import { useT } from '@/i18n';
import { matchesSearch } from '@/i18n/arabic';
import { roomDisplayName } from '@/lib/names';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Chip, Input, Select } from '@/components/ui/Form';
import { Menu } from '@/components/ui/Overlay';
import { EmptyState, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { LinkTabs } from '@/components/ui/Tabs';
import { useConfirm } from '@/components/ui/Confirm';
import { Dropzone, usePasteImages } from '@/components/images/Dropzone';
import { useUploadReferences } from '@/components/images/useUpload';
import { ReferenceCard, ReferenceEditor, referenceSearchText, useOpenReference } from '@/components/images/references';
import { VersionCard, VersionDetail } from '../versions/VersionDetail';
import { CompareWorkspace, parseItemsParam } from './Compare';

export function DesignLibraryPage() {
  const { tab = 'concepts', itemId } = useParams();
  const t = useT();
  const L = t.library;
  if (!['concepts', 'references', 'compare'].includes(tab)) return <Navigate to="/library/concepts" replace />;
  return (
    <div>
      <PageHeader eyebrow={t.app.name} title={L.title} description={L.lead} />
      <LinkTabs
        base="/library"
        className="mb-8"
        tabs={[
          { id: 'concepts', label: L.concepts, icon: Sparkles },
          { id: 'references', label: L.references, icon: Images },
          { id: 'compare', label: L.compare, icon: Columns2 },
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
  const t = useT();
  const L = t.library;
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
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Select value={room} onChange={(e) => setRoom(e.target.value)} className="col-span-2 sm:w-[200px]" aria-label={t.common.room}>
          <option value="all">{t.common.allRooms}</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {roomDisplayName(r)}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as VersionStatus | 'all')} className="sm:w-[170px]" aria-label={t.common.status}>
          <option value="all">{L.allStatuses}</option>
          {VERSION_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select value={origin} onChange={(e) => setOrigin(e.target.value as typeof origin)} className="sm:w-[170px]" aria-label={L.origin}>
          <option value="all">{L.originAll}</option>
          <option value="generated">{L.originGenerated}</option>
          <option value="imported">{L.originImported}</option>
          <option value="prompt-only">{L.originPromptOnly}</option>
        </Select>
        {selected.length > 0 && (
          <Button
            variant="primary"
            icon={Columns2}
            className="col-span-2 sm:ms-auto"
            onClick={() => navigate(`/library/compare?items=${selected.map((id) => `ver:${id}`).join(',')}`)}
          >
            {L.compareCount(selected.length)}
          </Button>
        )}
      </div>
      {versions.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={L.noConcepts}
          action={
            <ButtonLink to="/studio" variant="primary" icon={Sparkles}>
              {L.openStudio}
            </ButtonLink>
          }
        >
          {L.noConceptsBody}
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState compact title={L.noConceptsMatch} />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => (
            <VersionCard
              key={v.id}
              v={v}
              roomName={roomDisplayName(rooms.find((r) => r.id === v.roomId))}
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
  const navigate = useNavigate();
  const t = useT();
  const L = t.library;
  const files = useFilesMap();
  const openRef = useOpenReference();
  const confirm = useConfirm();
  const { upload, busy } = useUploadReferences();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<ReferenceKind | 'all'>('all');
  const [room, setRoom] = useState<string>('all');
  const [intent, setIntent] = useState<ImageIntent | 'all'>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [fileFilter, setFileFilter] = useState<'all' | 'images' | 'attachments' | FileKind>(() => (params.get('files') === 'attachments' ? 'attachments' : 'all'));
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
    return (refs ?? []).filter((r) => {
      const file = files?.get(r.imageId);
      const fk = file?.kind ?? 'image';
      return (
        (kind === 'all' || r.kind === kind) &&
        (room === 'all' ? true : room === 'none' ? r.roomIds.length === 0 : r.roomIds.includes(room) || r.directionRoomIds.includes(room)) &&
        (intent === 'all' || r.intent === intent) &&
        (!tag || r.tags.includes(tag)) &&
        (fileFilter === 'all' || (fileFilter === 'images' ? fk === 'image' : fileFilter === 'attachments' ? fk !== 'image' : fk === fileFilter)) &&
        (!q.trim() || matchesSearch(referenceSearchText(r, file, rooms, `${t.enums.fileKind[fk]} ${referenceKindName(r.kind)}`), q))
      );
    });
  }, [refs, q, kind, room, intent, tag, fileFilter, files, rooms, t]);
  const attachmentKinds = useMemo(
    () => Array.from(new Set((refs ?? []).map((r) => files?.get(r.imageId)?.kind).filter((k): k is FileKind => !!k && k !== 'image'))),
    [refs, files],
  );

  if (!refs) return <LoadingBlock />;

  const bulkDelete = async () => {
    const r = await confirm({
      title: L.bulkDeleteTitle(selected.length),
      tone: 'danger',
      confirmLabel: t.refs.deleteConfirm,
      description: L.bulkDeleteBody,
    });
    if (!r.confirmed) return;
    await deleteReferences(selected);
    setSelected([]);
    toast.success(L.deleted(selected.length), { description: t.trash.moveHint });
  };

  return (
    <div className="flex flex-col gap-6">
      <div ref={dropRef} className="grid gap-3 md:grid-cols-[230px_minmax(0,1fr)]">
        <div className="grid grid-cols-2 gap-2 md:flex md:flex-col">
          <Select value={uploadKind} onChange={(e) => setUploadKind(e.target.value as ReferenceKind)} aria-label={L.uploadAs}>
            {REFERENCE_KINDS.filter((k) => k.value !== 'generated').map((k) => (
              <option key={k.value} value={k.value}>
                {L.uploadAsValue(k.label)}
              </option>
            ))}
          </Select>
          <Select value={uploadRoom} onChange={(e) => setUploadRoom(e.target.value)} aria-label={L.linkToRoom}>
            <option value="">{L.notLinked}</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {L.linkToValue(roomDisplayName(r))}
              </option>
            ))}
          </Select>
          <p className="col-span-2 hidden text-[11.5px] text-ink-3 sm:block">{L.pasteHint}</p>
        </div>
        <Dropzone onFiles={doUpload} busy={busy} compact label={L.drop} />
      </div>

      <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label={L.fileTypes}>
        {(['all', 'images', 'attachments'] as const).map((f) => (
          <Chip key={f} active={fileFilter === f} onClick={() => setFileFilter(f)} className="shrink-0">
            {L.fileFilter[f]}
          </Chip>
        ))}
        {attachmentKinds.length > 1 &&
          attachmentKinds.map((k) => (
            <Chip key={k} active={fileFilter === k} onClick={() => setFileFilter(k)} className="shrink-0">
              {t.enums.fileKind[k]}
            </Chip>
          ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 min-w-[200px] flex-1 sm:max-w-[320px]">
          <Search size={14} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L.searchPlaceholder} className="ps-8" aria-label={L.searchLabel} type="search" />
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value as ReferenceKind | 'all')} className="sm:w-[170px]" aria-label={t.common.type}>
          <option value="all">{L.allTypes}</option>
          {REFERENCE_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
        <Select value={room} onChange={(e) => setRoom(e.target.value)} className="sm:w-[180px]" aria-label={t.common.room}>
          <option value="all">{t.common.allRooms}</option>
          <option value="none">{L.notLinked}</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {roomDisplayName(r)}
            </option>
          ))}
        </Select>
        <Select value={intent} onChange={(e) => setIntent(e.target.value as ImageIntent | 'all')} className="sm:w-[150px]" aria-label={t.refs.meaning}>
          <option value="all">{L.anyMeaning}</option>
          <option value="want">{t.refs.want}</option>
          <option value="avoid">{t.refs.avoid}</option>
          <option value="neutral">{L.context}</option>
        </Select>
        <span className="text-[12px] text-ink-3 sm:ms-auto">{L.countOf(list.length, refs.length)}</span>
      </div>
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag size={13} className="text-ink-4" />
          {allTags.map((tg) => (
            <Chip key={tg} active={tag === tg} onClick={() => setTag(tag === tg ? null : tg)}>
              <bdi>{tg}</bdi>
            </Chip>
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-md border border-ink bg-ink px-3 py-2 text-canvas shadow-pop">
          <span className="text-[12.5px]">{t.common.selected(selected.length)}</span>
          <Menu
            align="start"
            trigger={
              <Button size="sm" variant="secondary" icon={Link2}>
                {L.linkToRoom}
              </Button>
            }
            items={rooms.map((r) => ({
              label: roomDisplayName(r),
              onSelect: async () => {
                await linkReferences(selected, 'roomIds', r.id);
                toast.success(L.linkedTo(roomDisplayName(r)));
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
              toast.success(L.tagsAdded);
            }}
          >
            <Input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder={L.addTags} className="!h-8 !w-[150px] text-[12.5px] !text-ink" dir="auto" />
            <Button size="sm" variant="secondary" type="submit" icon={Plus}>
              {L.tag}
            </Button>
          </form>
          <Button size="sm" variant="danger" icon={Trash2} onClick={bulkDelete}>
            {t.common.delete}
          </Button>
          <Button size="sm" variant="ghost" icon={X} className="ms-auto !text-canvas hover:!bg-white/10" onClick={() => setSelected([])}>
            {t.common.clear}
          </Button>
        </div>
      )}

      {refs.length === 0 ? (
        <EmptyState icon={Images} title={L.emptyTitle}>
          {L.emptyBody}
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState compact title={L.noMatch} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {list.map((r) => (
            <ReferenceCard
              key={r.id}
              reference={r}
              selected={selected.includes(r.id)}
              onToggleSelect={() => setSelected((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))}
              onOpen={() => openRef(list, list.indexOf(r))}
              onEdit={() => setEditing(r)}
              footer={
                r.roomIds.length > 0 ? (
                  <div className="truncate border-t border-line px-3 py-1.5 text-[11px] text-ink-3">
                    {r.roomIds
                      .map((id) => roomDisplayName(rooms.find((x) => x.id === id)))
                      .filter(Boolean)
                      .join('، ')}
                  </div>
                ) : null
              }
              menu={[
                { label: L.editDetails, icon: Pencil, onSelect: () => setEditing(r) },
                { label: t.refs.viewFull, icon: Expand, onSelect: () => openRef([r]) },
                ...(files?.get(r.imageId)?.kind === 'image' || !files?.get(r.imageId)
                  ? [{ label: L.compare, icon: Columns2, onSelect: () => navigate(`/library/compare?items=ref:${r.id}`) }]
                  : []),
                {
                  label: L.downloadOriginal,
                  icon: Download,
                  onSelect: async () => {
                    const o = await getOriginalBlob(r.imageId);
                    if (o) downloadBlob(o.blob, o.name);
                  },
                },
                'separator',
                {
                  label: t.common.delete,
                  icon: Trash2,
                  danger: true,
                  onSelect: async () => {
                    const res = await confirm({
                      title: t.refs.deleteTitle,
                      tone: 'danger',
                      confirmLabel: t.refs.deleteConfirm,
                      description: L.deleteOneBody,
                    });
                    if (res.confirmed) {
                      await deleteReferences([r.id]);
                      toast.success(L.deleted(1), { description: t.trash.moveHint });
                    }
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
  const t = useT();
  const L = t.library;
  const items = parseItemsParam(params.get('items'));
  if (comparisonId && comparison === undefined) return <LoadingBlock />;
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_260px]">
      <CompareWorkspace key={comparison?.id ?? params.get('items') ?? 'new'} comparison={comparison ?? null} initialItems={items} />
      <aside>
        <div className="mb-3 flex items-center justify-between">
          <span className="eyebrow">{L.savedComparisons}</span>
          <Link to="/library/compare" className="touch-target text-[12px] text-accent hover:underline">
            {L.newComparison}
          </Link>
        </div>
        {comparisons.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">{L.noComparisons}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {comparisons.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/library/compare/${c.id}`}
                  className={`block rounded-md border px-3 py-2 hover:border-line-strong ${c.id === comparisonId ? 'border-ink' : 'border-line'} bg-surface`}
                >
                  <div className="truncate text-[13px]" dir="auto">
                    {c.title}
                  </div>
                  <div className="text-[11px] text-ink-3">
                    {t.common.image(c.items.length)} · {roomDisplayName(rooms.find((r) => r.id === c.roomId)) || L.mixed} · {fmtDateTime(c.updatedAt)}
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
