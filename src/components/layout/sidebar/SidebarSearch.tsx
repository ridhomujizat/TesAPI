import { Search } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  children?: ReactNode;
}

export function SidebarSearch({ placeholder, value, onChange, children }: Props) {
  return (
    <div className="sidebar-search">
      <div className="search-box"><Search size={13} color="var(--text-muted)" /><input placeholder={placeholder} spellCheck={false} value={value} onChange={(event) => onChange(event.target.value)} /><kbd>⌘K</kbd></div>
      {children}
    </div>
  );
}
