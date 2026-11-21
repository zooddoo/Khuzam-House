import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Armchair, Home, LayoutGrid, Library, Map, Menu as MenuIcon, Search, Settings, Sparkles, X, type LucideIcon } from 'lucide-react';
import { useProject, useSettings } from '@/lib/hooks/data';
import { cn } from '@/components/ui/cn';
import { Kbd } from '@/components/ui/Display';
import { CommandPalette } from './CommandPalette';
import { imageProviderSummary } from '@/lib/ai/providers/registry';

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/rooms', label: 'My Rooms', icon: LayoutGrid },
  { to: '/floor-plans', label: 'Floor Plans', icon: Map },
  { to: '/studio', label: 'Design Studio', icon: Sparkles },
  { to: '/library', label: 'Design Library', icon: Library },
  { to: '/materials', label: 'Materials & Furniture', icon: Armchair },
  { to: '/settings', label: 'Settings & Backup', icon: Settings },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group flex h-9 items-center gap-3 rounded-sm px-3 text-[13.5px] transition-colors',
              isActive ? 'bg-ink text-canvas' : 'text-ink-2 hover:bg-mist hover:text-ink',
            )
          }
        >
          <Icon size={16} strokeWidth={1.6} className="shrink-0" />
          <span className="truncate">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  const project = useProject();
  return (
    <div className="px-3">
      <div className="display text-[30px] leading-none text-ink">{project?.name ?? 'Bait Khuzam'}</div>
      <div className="eyebrow mt-1.5 !text-[10px] !tracking-[0.24em]">Studio</div>
    </div>
  );
}

function SidebarFooter({ onSearch }: { onSearch: () => void }) {
  const settings = useSettings();
  const summary = settings ? imageProviderSummary(settings.imageProvider) : null;
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onSearch}
        className="flex h-9 items-center gap-2 rounded-sm border border-line bg-raised px-3 text-[12.5px] text-ink-3 hover:border-line-strong hover:text-ink"
      >
        <Search size={14} />
        <span className="flex-1 text-left">Search</span>
        <Kbd>⌘K</Kbd>
      </button>
      {summary && (
        <NavLink to="/settings" className="rounded-sm px-3 py-2 text-[11.5px] leading-snug text-ink-3 hover:bg-mist">
          <span className="flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 rounded-full', summary.configured ? 'bg-ok' : 'bg-ink-4')} />
            {summary.configured ? 'Image generation ready' : 'Image generation not set up'}
          </span>
          <span className="mt-0.5 block truncate pl-3 text-ink-4">{summary.label}</span>
        </NavLink>
      )}
    </div>
  );
}

export function AppShell() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
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
  }, [location.pathname]);

  return (
    <div className="flex h-full">
      <aside className="hidden w-[248px] shrink-0 flex-col justify-between border-r border-line bg-surface/70 px-3 pb-4 pt-7 lg:flex">
        <div className="flex flex-col gap-8">
          <Brand />
          <NavItems />
        </div>
        <SidebarFooter onSearch={() => setSearchOpen(true)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface/80 px-4 lg:hidden">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setDrawer(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm hover:bg-mist"
          >
            <MenuIcon size={18} />
          </button>
          <span className="display text-[22px]">Bait Khuzam</span>
          <button
            type="button"
            aria-label="Search"
            onClick={() => setSearchOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm hover:bg-mist"
          >
            <Search size={17} />
          </button>
        </header>
        <main id="main-scroll" className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1480px] px-4 pb-24 pt-6 sm:px-8 lg:px-12 lg:pt-10">
            <Outlet />
          </div>
        </main>
      </div>

      <RadixDialog.Root open={drawer} onOpenChange={setDrawer}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/30 lg:hidden" />
          <RadixDialog.Content
            className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col justify-between bg-surface px-3 pb-4 pt-5 shadow-pop lg:hidden"
            aria-describedby={undefined}
          >
            <div className="flex flex-col gap-6">
              <div className="flex items-start justify-between">
                <RadixDialog.Title asChild>
                  <div>
                    <Brand />
                  </div>
                </RadixDialog.Title>
                <RadixDialog.Close aria-label="Close navigation" className="inline-flex h-8 w-8 items-center justify-center rounded-sm hover:bg-mist">
                  <X size={16} />
                </RadixDialog.Close>
              </div>
              <NavItems onNavigate={() => setDrawer(false)} />
            </div>
            <SidebarFooter
              onSearch={() => {
                setDrawer(false);
                setSearchOpen(true);
              }}
            />
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
