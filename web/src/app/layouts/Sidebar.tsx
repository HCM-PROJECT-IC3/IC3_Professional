import { NavLink } from 'react-router';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import logoUrl from '../../../../favicon.svg';
import { navFor, type NavItem } from '@/app/navigation';
import { useViewer } from '@/app/providers/ViewerProvider';
import { LegacyLink } from '@/features/legacy/LegacyLink';
import { cn } from '@/lib/utils';

const itemCls = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors';
const idleCls = 'text-muted-foreground hover:bg-muted hover:text-foreground';
const activeCls = 'bg-secondary font-medium text-secondary-foreground';

function Item({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon;
  if (item.to) {
    return (
      <NavLink to={item.to} end onClick={onNavigate} className={({ isActive }) => cn(itemCls, isActive ? activeCls : idleCls)}>
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{item.label}</span>
      </NavLink>
    );
  }
  return (
    <LegacyLink page={item.legacy!} className={cn(itemCls, idleCls, 'group')}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
      <ArrowUpRight className="ml-auto size-3.5 shrink-0 opacity-0 group-hover:opacity-60" aria-label="mở trang hiện tại" />
    </LegacyLink>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { role } = useViewer();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
        <img src={logoUrl} alt="" className="size-7" />
        <div className="leading-tight">
          <p className="text-sm font-semibold">IC3 Professional</p>
          <p className="text-[11px] text-muted-foreground">EduQuiz 2.0</p>
        </div>
      </div>
      <nav aria-label="Điều hướng chính" className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {navFor(role).map((g) => (
          <div key={g.label}>
            <p className="px-3 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li key={it.label}>
                  <Item item={it} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t p-3">
        <LegacyLink page="index.html" className={cn(itemCls, idleCls)}>
          <ArrowLeft className="size-4" aria-hidden /> Giao diện hiện tại
        </LegacyLink>
      </div>
    </div>
  );
}
