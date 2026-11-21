import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Armchair, Home, LayoutGrid, Library, LogOut, Map, MoreHorizontal, Search, Settings, Sparkles, Trash2, type LucideIcon } from 'lucide-react';
import { useProject, useSettings } from '@/lib/hooks/data';
import { cn } from '@/components/ui/cn';
import { Kbd } from '@/components/ui/Display';
import { useConfirm } from '@/components/ui/Confirm';
import { CommandPalette } from './CommandPalette';
import { SaveStatus } from './SaveStatus';
import { LanguageToggle } from './LanguageToggle';
import { imageProviderSummary } from '@/lib/ai/providers/registry';
import { useI18n, useT, type Messages } from '@/i18n';
import { signOut, useAuth } from '@/lib/sync/auth';
import { useSyncStatus } from '@/lib/sync/engine';
import { InstallPrompt } from './InstallPrompt';

type NavKey = keyof Pick<Messages['nav'], 'home' | 'rooms' | 'floorPlans' | 'studio' | 'library' | 'materials' | 'settings' | 'deleted'>;

const NAV: { to: string; key: NavKey; short?: 'roomsShort' | 'studioShort' | 'libraryShort'; icon: LucideIcon; end?: boolean; bottom?: boolean }[] = [
  { to: '/', key: 'home', icon: Home, end: true, bottom: true },
  { to: '/rooms', key: 'rooms', short: 'roomsShort', icon: LayoutGrid, bottom: true },
  { to: '/studio', key: 'studio', short: 'studioShort', icon: Sparkles, bottom: true },
  { to: '/library', key: 'library', short: 'libraryShort', icon: Library, bottom: true },
  { to: '/floor-plans', key: 'floorPlans', icon: Map },
  { to: '/materials', key: 'materials', icon: Armchair },
  { to: '/settings', key: 'settings', icon: Settings },
  { to: '/deleted', key: 'deleted', icon: Trash2 },
];

function NavItems({ onNavigate, items = NAV }: { onNavigate?: () => void; items?: typeof NAV }) {
  const t = useT();
  return (
    <nav className="flex flex-col gap-0.5" aria-label={t.ui.mainNav}>
      {items.map(({ to, key, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group flex h-11 items-center gap-3 rounded-sm px-3 text-[14px] transition-colors lg:h-9 lg:text-[13.5px]',
              isActive ? 'bg-ink text-canvas' : 'text-ink-2 hover:bg-mist hover:text-ink',
            )
          }
        >
          <Icon size={16} strokeWidth={1.6} className="shrink-0" />
          <span className="truncate">{t.nav[key]}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function Brand({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const { t, lang } = useI18n();
  const project = useProject();
  const name = (lang === 'ar' ? project?.nameAr || project?.name : project?.name || project?.nameAr) ?? (lang === 'ar' ? 'بيت خزام' : 'Bait Khuzam');
  if (size === 'sm') return <span className="display truncate text-[20px] leading-none">{name}</span>;
  return (
    <div className="px-3">
      <div className="display text-[30px] leading-none text-ink">{name}</div>
      <div className="eyebrow mt-1.5">{t.nav.studioShort}</div>
    </div>
  );
}

function useSignOut() {
  const t = useT();
  const confirm = useConfirm();
  const sync = useSyncStatus();
  return async () => {
    const pending = sync.pending + sync.uploads.queued + sync.uploads.active.length;
    const r = await confirm({
      title: t.auth.signOutConfirmTitle,
      description: pending ? t.auth.signOutPending(pending) : t.auth.signOutConfirm,
      confirmLabel: t.nav.signOut,
      tone: pending ? 'danger' : 'default',
    });
    if (r.confirmed) await signOut();
  };
}

function AccountRow() {
  const t = useT();
  const auth = useAuth();
  const doSignOut = useSignOut();
  if (auth.status !== 'signed-in') return null;
  return (
    <div className="flex items-center gap-2 rounded-sm px-3 py-1.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold uppercase text-accent">
        {auth.email.slice(0, 1) || '·'}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3" dir="ltr" title={t.nav.signedInAs(auth.email)}>
        {auth.email}
      </span>
      <button
        type="button"
        onClick={() => void doSignOut()}
        aria-label={t.nav.signOut}
        title={t.nav.signOut}
        className="touch-target inline-flex h-8 w-8 items-center justify-center rounded-sm text-ink-3 hover:bg-mist hover:text-ink"
      >
        <LogOut size={15} className="rtl:-scale-x-100" />
      </button>
    </div>
  );
}

function SidebarFooter({ onSearch }: { onSearch: () => void }) {
  const t = useT();
  const settings = useSettings();
  const summary = settings ? imageProviderSummary(settings.imageProvider) : null;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onSearch}
        className="flex h-9 items-center gap-2 rounded-sm border border-line bg-raised px-3 text-[12.5px] text-ink-3 hover:border-line-strong hover:text-ink"
      >
        <Search size={14} />
        <span className="flex-1 text-start">{t.common.search}</span>
        <Kbd>⌘K</Kbd>
      </button>
      <div className="flex items-center justify-between gap-1">
        <SaveStatus />
        <LanguageToggle />
      </div>
      {summary && (
        <NavLink to="/settings" className="rounded-sm px-3 py-1.5 text-[11.5px] leading-snug text-ink-3 hover:bg-mist">
          <span className="flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 rounded-full', summary.configured ? 'bg-ok' : 'bg-ink-4')} />
            {summary.configured ? t.nav.imageReady : t.nav.imageNotSetUp}
          </span>
        </NavLink>
      )}
      <AccountRow />
    </div>
  );
}

function BottomNav({ onMore }: { onMore: () => void }) {
  const t = useT();
  const location = useLocation();
  const moreActive = NAV.filter((n) => !n.bottom).some((n) => location.pathname.startsWith(n.to));
  return (
    <nav
      aria-label={t.ui.mainNav}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid max-w-[640px] grid-cols-5">
        {NAV.filter((n) => n.bottom).map(({ to, key, short, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn('flex h-16 flex-col items-center justify-center gap-1 text-[11.5px] transition-colors', isActive ? 'text-ink' : 'text-ink-3')
            }
          >
            {({ isActive }) => (
              <>
                <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-accent-soft text-accent')}>
                  <Icon size={19} strokeWidth={isActive ? 2 : 1.6} />
                </span>
                <span className="max-w-full truncate px-1">{t.nav[short ?? key]}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onMore}
          className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[11.5px]', moreActive ? 'text-ink' : 'text-ink-3')}
        >
          <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', moreActive && 'bg-accent-soft text-accent')}>
            <MoreHorizontal size={19} strokeWidth={1.6} />
          </span>
          <span>{t.nav.more}</span>
        </button>
      </div>
    </nav>
  );
}

export function AppShell() {
  const t = useT();
  const [searchOpen, setSearchOpen] = useState(false);
  const [more, setMore] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.getElementById('main-scroll')?.scrollTo({ top: 0 });
    setMore(false);
  }, [location.pathname]);

  return (
    <div className="flex h-full">
      <aside className="hidden w-[248px] shrink-0 flex-col justify-between border-e border-line bg-surface/70 px-3 pb-4 pt-7 lg:flex">
        <div className="flex flex-col gap-8">
          <Brand />
          <NavItems />
        </div>
        <SidebarFooter onSearch={() => setSearchOpen(true)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line bg-surface/90 px-3 pt-[env(safe-area-inset-top)] lg:hidden">
          <div className="min-w-0 flex-1 ps-1">
            <Brand size="sm" />
          </div>
          <SaveStatus compact />
          <LanguageToggle compact />
          <button
            type="button"
            aria-label={t.common.search}
            onClick={() => setSearchOpen(true)}
            className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-sm hover:bg-mist"
          >
            <Search size={18} />
          </button>
        </header>
        <main id="main-scroll" className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1480px] px-4 pb-[calc(env(safe-area-inset-bottom)+96px)] pt-5 sm:px-8 lg:px-12 lg:pb-24 lg:pt-10">
            <InstallPrompt />
            <Outlet />
          </div>
        </main>
      </div>

      <BottomNav onMore={() => setMore(true)} />

      <RadixDialog.Root open={more} onOpenChange={setMore}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/30 animate-fade-in lg:hidden" />
          <RadixDialog.Content
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-lg border-t border-line bg-surface px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-pop animate-rise-in lg:hidden"
            aria-describedby={undefined}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
            <RadixDialog.Title className="sr-only">{t.nav.more}</RadixDialog.Title>
            <NavItems onNavigate={() => setMore(false)} items={NAV.filter((n) => !n.bottom)} />
            <div className="mt-3 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => {
                  setMore(false);
                  setSearchOpen(true);
                }}
                className="flex h-11 w-full items-center gap-3 rounded-sm px-3 text-[14px] text-ink-2 hover:bg-mist"
              >
                <Search size={16} strokeWidth={1.6} /> {t.nav.search}
              </button>
              <AccountRow />
            </div>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
