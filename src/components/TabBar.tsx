import { IconProgress, IconSettings, IconToday } from './Icons';

export type Tab = 'today' | 'progress' | 'settings';
const TABS: { id: Tab; label: string; Icon: typeof IconToday }[] = [
  { id: 'today', label: 'Today', Icon: IconToday },
  { id: 'progress', label: 'Progress', Icon: IconProgress },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
];

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(({ id, label, Icon }) => (
        <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => onChange(id)}>
          <Icon />
          {label}
        </button>
      ))}
    </nav>
  );
}
