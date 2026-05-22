import { useState } from 'react';
import { Search, Bell, Settings, Sparkles } from 'lucide-react';
import { useAuth } from '../../store/AuthContext';

interface HeaderProps {
  onSearch?: (q: string) => void;
}

export function Header({ onSearch }: HeaderProps) {
  const [query, setQuery] = useState('');
  const { user } = useAuth();

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    onSearch?.(e.target.value);
  }

  return (
    <header className="h-14 bg-white border-b border-gray-100 px-6 flex items-center gap-4 shrink-0 shadow-sm">
      {/* Search */}
      <div className="flex-1 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={handleSearch}
          placeholder="Search courses, batches, students..."
          className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all"
        />
      </div>

      {/* AI Tools button */}
      <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors">
        <Sparkles className="w-4 h-4" />
        AI tools
      </button>

      {/* Notifications — no badge */}
      <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors relative">
        <Bell className="w-5 h-5" />
      </button>

      {/* Settings — no badge */}
      <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
        <Settings className="w-5 h-5" />
      </button>

      {/* User avatar */}
      <div className="flex items-center gap-2 pl-2 border-l border-gray-100">
        <div className="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center text-white text-xs font-bold">
          {user?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() ?? 'U'}
        </div>
        <div className="hidden md:block">
          <p className="text-xs font-semibold text-gray-800 leading-tight">{user?.name}</p>
          <p className="text-[10px] text-gray-400">{user?.role?.replace('_', ' ')}</p>
        </div>
      </div>
    </header>
  );
}
