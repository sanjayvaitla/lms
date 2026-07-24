import { useRef } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { LogOut, Briefcase, User } from 'lucide-react';
import { useAuth } from '../../store/AuthContext';
import { BackToTop } from './ui/BackToTop';
import { authToast } from '../../lib/authToast';

export function InternLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);

  async function handleLogout() {
    await logout();
    authToast.signedOut();
    navigate('/login');
  }

  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? 'IN';

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-white rounded-lg p-1 flex items-center justify-center shadow-sm border border-slate-100 shrink-0">
            <img src="/logo.png" alt="Vtricks" className="h-8 object-contain" />
          </div>
          <div className="h-5 w-px bg-slate-200 shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shrink-0">
              <Briefcase className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-bold text-slate-800 block leading-tight">Intern Portal</span>
              <span className="text-[10px] text-slate-400 hidden sm:block">Tasks · logs · certificate</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-slate-800 leading-tight truncate max-w-[140px]">{user?.name}</p>
            <p className="text-[10px] text-slate-400 leading-tight truncate max-w-[140px]">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/my-profile')}
            className="lms-press w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold shadow-sm"
            title="My Profile"
            aria-label="My Profile"
          >
            {initials}
          </button>
          <button
            type="button"
            onClick={() => navigate('/my-profile')}
            className="lms-press hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors duration-300 ease-out"
          >
            <User className="w-3.5 h-3.5" />
            Profile
          </button>
          <button
            onClick={handleLogout}
            className="lms-press flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors duration-300 ease-out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto overscroll-contain scroll-smooth">
        <div className="p-4 sm:p-6 min-h-full pb-20 lms-page">
          <Outlet />
        </div>
        <BackToTop scrollRef={mainRef} />
      </main>
    </div>
  );
}
