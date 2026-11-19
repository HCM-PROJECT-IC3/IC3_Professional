import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import {
  ArrowLeft, Bell, Bot, Landmark, Settings2, BookOpenCheck, CheckCheck, Gem, LogOut, Menu, Moon, ScrollText, Sun, UserRound, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDismiss } from '@/hooks/useDismiss';
import { getTheme, setTheme, type Theme } from '@/lib/theme';
import { cn, legacyUrl } from '@/lib/utils';
import { ART } from '../assets';
import { DEMO_MODES, DemoStateProvider, useBlock, useDemoMode } from '../demo/DemoState';
import { ME, NOTICES, type Notice } from '../demo/data';
import { MY_EXP, MY_REALM, MY_STONES, runDemoBreakthrough } from '../demo/engineDemo';
import type { Result } from '../engine';
import { BreakthroughDialog } from '../ui/BreakthroughDialog';
import { realmOf } from '../model';
import { DataBlock, Tabs } from '../ui/controls';
import { Drawer } from '../ui/overlay';
import { RealmSeal, TrAvatar, trPath } from '../ui/primitives';
import { TR_NAV } from './nav';

/* Khung TechRealm: sidebar (cố định từ 1024px, ngăn kéo khi nhỏ hơn) · header · main · footer · thông báo · hồ sơ.
   Toàn bộ khu này 0 lượt Firebase, 0 lượt Apps Script: dữ liệu mẫu nằm trong bundle (demo/data.ts). */

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <Link to={trPath()} onClick={onNavigate} className="flex h-14 shrink-0 items-center gap-2.5 px-4">
        <img src={ART.logo} alt="" className="size-7" />
        <span className="leading-tight">
          <span className="block text-sm font-semibold">TechRealm</span>
          <span className="block text-[11px] text-muted-foreground">Học · Tu luyện · Thực hành</span>
        </span>
      </Link>
      <nav aria-label="TechRealm" className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-0.5">
          {TR_NAV.map((it) => (
            <li key={it.to}>
              <NavLink
                to={trPath(it.to)}
                end
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-lg border-l-2 px-3 py-1.5 transition-colors',
                    isActive ? 'border-gold bg-secondary text-secondary-foreground' : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <it.icon className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-medium">{it.label}</span>
                  <span className="block truncate text-[11px] opacity-75">{it.plain}</span>
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="shrink-0 space-y-1 border-t p-3 text-sm">
        <NavLink to={trPath('quan-ly-cong-phap')} onClick={onNavigate} className={({ isActive }) => cn('flex items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-muted hover:text-foreground', isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground')}>
          <Settings2 className="size-4" aria-hidden /> Thầy cô: Quản lý công pháp
        </NavLink>
        <NavLink to={trPath('su-phu')} onClick={onNavigate} className={({ isActive }) => cn('flex items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-muted hover:text-foreground', isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground')}>
          <Bot className="size-4" aria-hidden /> AI Sư Phụ
        </NavLink>
        <NavLink to={trPath('tong-mon')} onClick={onNavigate} className={({ isActive }) => cn('flex items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-muted hover:text-foreground', isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground')}>
          <Landmark className="size-4" aria-hidden /> Thầy cô: Tông môn
        </NavLink>
        <Link to="/" className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Về EduQuiz 2.0
        </Link>
      </div>
    </div>
  );
}

const NOTICE_ICON: Record<Notice['kind'], typeof Bell> = { quest: ScrollText, review: BookOpenCheck, realm: Gem, system: Bell };

function NotificationPanel({ open, onClose, items, setItems }: { open: boolean; onClose: () => void; items: Notice[]; setItems: (n: Notice[]) => void }) {
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const unread = items.filter((n) => !n.read).length;
  const shown = tab === 'all' ? items : items.filter((n) => !n.read);
  const state = useBlock(shown);
  const read = (id: string) => setItems(items.map((n) => (n.id === id ? { ...n, read: true } : n)));
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Thông báo"
      description="Nhiệm vụ, kết quả duyệt và tin của tông môn."
      footer={
        <Button variant="outline" size="sm" disabled={!unread} onClick={() => setItems(items.map((n) => ({ ...n, read: true })))}>
          <CheckCheck /> Đánh dấu đã đọc tất cả
        </Button>
      }
    >
      <Tabs
        label="Lọc thông báo"
        value={tab}
        onChange={setTab}
        items={[{ id: 'all', label: 'Tất cả', count: items.length }, { id: 'unread', label: 'Chưa đọc', count: unread }]}
        className="mb-3"
      />
      <DataBlock state={state} empty={{ title: tab === 'unread' ? 'Đã đọc hết' : 'Chưa có thông báo', description: 'Khi thầy cô giao nhiệm vụ hay duyệt sản phẩm, tin sẽ hiện ở đây.' }}>
        {(list) => (
          <ul className="space-y-1">
            {list.map((n) => {
              const Icon = NOTICE_ICON[n.kind];
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => read(n.id)}
                    className={cn('flex w-full gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-muted', !n.read && 'bg-accent')}
                  >
                    <Icon className={cn('mt-0.5 size-4 shrink-0', n.read ? 'text-muted-foreground' : 'text-primary')} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {n.title}
                        {!n.read && <span className="size-1.5 rounded-full bg-primary" aria-label="chưa đọc" />}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">{n.when}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DataBlock>
    </Drawer>
  );
}

function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };
  const item = 'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted';
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Hồ sơ"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full p-0.5 pr-0.5 hover:bg-muted sm:pr-2"
      >
        <TrAvatar id={ME.avatar} size={32} />
        <span className="hidden text-sm font-medium sm:inline">{ME.name}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-xl border bg-card p-2 shadow-lg animate-tr-in">
          <div className="flex items-center gap-3 border-b px-2.5 pb-3 pt-1.5">
            <TrAvatar id={ME.avatar} size={44} framed />
            <div className="min-w-0">
              <p className="truncate font-semibold">{ME.name}</p>
              <p className="truncate text-xs text-muted-foreground">{ME.title} · {ME.sect}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs"><RealmSeal realm={MY_REALM} size={14} /> {realmOf(MY_REALM).name}</p>
            </div>
          </div>
          <div className="pt-1.5">
            <Link role="menuitem" to={trPath('nhan-vat')} onClick={close} className={item}>
              <UserRound className="size-4 text-muted-foreground" aria-hidden /> Hồ sơ nhân vật
            </Link>
            <button role="menuitem" type="button" onClick={toggleTheme} className={item}>
              {theme === 'dark' ? <Sun className="size-4 text-muted-foreground" aria-hidden /> : <Moon className="size-4 text-muted-foreground" aria-hidden />}
              {theme === 'dark' ? 'Nền sáng' : 'Nền tối'}
            </button>
            <a role="menuitem" href={legacyUrl('index.html')} className={item}>
              <ArrowLeft className="size-4 text-muted-foreground" aria-hidden /> Giao diện hiện tại
            </a>
            <button role="menuitem" type="button" disabled className={cn(item, 'cursor-not-allowed opacity-60 hover:bg-transparent')} title="Có ở bản tích hợp (mã học tập)">
              <LogOut className="size-4 text-muted-foreground" aria-hidden /> Thoát mã học tập trên máy này
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ onMenu, onBell, unread }: { onMenu: () => void; onBell: () => void; unread: number }) {
  const { pathname } = useLocation();
  const here = TR_NAV.find((n) => trPath(n.to) === pathname.replace(/\/$/, '')) ?? (pathname.endsWith('/nhan-vat') ? { label: 'Hồ sơ nhân vật' } : undefined);
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4">
      <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={onMenu} aria-label="Mở menu">
        <Menu />
      </Button>
      <p className="truncate text-sm font-medium lg:hidden">{here?.label ?? 'TechRealm'}</p>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <Link to={trPath('nhan-vat')} className="hidden items-center gap-2 rounded-lg border px-2.5 py-1 text-sm hover:bg-muted md:flex" title="Cảnh giới và công huân">
          <RealmSeal realm={MY_REALM} size={18} />
          <span className="font-medium">{realmOf(MY_REALM).name}</span>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{MY_EXP.toLocaleString('vi-VN')} CH</span>
        </Link>
        <Link to={trPath('tui-can-khon')} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm hover:bg-muted" title="Linh thạch">
          <Gem className="size-4 text-violet" aria-hidden />
          <span className="font-mono tabular-nums">{MY_STONES}</span>
          <span className="sr-only">linh thạch</span>
        </Link>
        <Button variant="ghost" size="icon" onClick={onBell} aria-label={`Thông báo, ${unread} chưa đọc`} className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 font-mono text-[10px] leading-4 text-white">{unread}</span>
          )}
        </Button>
        <ProfileMenu />
      </div>
    </header>
  );
}

function Footer() {
  const { mode, setMode } = useDemoMode();
  const [bt, setBt] = useState<Result | null>(null);
  return (
    <footer className="border-t px-4 py-4 text-xs text-muted-foreground sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2">
        <span>TechRealm · bản xem thử giao diện. Dữ liệu mẫu nằm trên máy, không gửi đi đâu.</span>
        <button type="button" onClick={() => setBt(runDemoBreakthrough())} className="ml-auto underline-offset-2 hover:text-foreground hover:underline">
          Xem thử hiệu ứng đột phá
        </button>
        <BreakthroughDialog result={bt && bt.to ? bt : null} onClose={() => setBt(null)} />
        <label className="flex items-center gap-2">
          Trạng thái dữ liệu
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="h-7 rounded-md border bg-card px-2 text-xs text-foreground">
            {DEMO_MODES.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>
    </footer>
  );
}

export function TrShell() {
  const [menu, setMenu] = useState(false);
  const [bell, setBell] = useState(false);
  const [notices, setNotices] = useState(NOTICES);
  const panel = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenu(false), []);
  const { pathname } = useLocation();
  useDismiss(menu, panel, closeMenu);
  useEffect(() => {
    closeMenu();
    window.scrollTo(0, 0);
  }, [pathname, closeMenu]);
  useEffect(() => {
    const prev = document.title;
    document.title = 'TechRealm — IC3 Professional';
    return () => { document.title = prev; };
  }, []);

  return (
    <DemoStateProvider>
      <div className="tr min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh border-r bg-card lg:block">
          <Sidebar />
        </aside>
        {menu && (
          <div className="fixed inset-0 z-40 bg-black/45 lg:hidden">
            <div ref={panel} role="dialog" aria-modal="true" aria-label="Menu" className="relative h-full w-72 max-w-[85vw] border-r bg-card shadow-xl animate-tr-in">
              <Button variant="ghost" size="icon" className="absolute right-2 top-2.5" onClick={closeMenu} aria-label="Đóng menu">
                <X />
              </Button>
              <Sidebar onNavigate={closeMenu} />
            </div>
          </div>
        )}
        <div className="flex min-w-0 flex-col">
          <Header onMenu={() => setMenu(true)} onBell={() => setBell(true)} unread={notices.filter((n) => !n.read).length} />
          <main key={pathname} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 animate-tr-in sm:px-6">
            <Outlet />
          </main>
          <Footer />
        </div>
        <NotificationPanel open={bell} onClose={() => setBell(false)} items={notices} setItems={setNotices} />
        <div id="tr-layer" />
      </div>
    </DemoStateProvider>
  );
}
