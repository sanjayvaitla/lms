import { NavLink, useNavigate } from 'react-router';
import { Home, BookOpen, Calendar, LogOut, Code2, Layers, Wallet, ClipboardCheck, Video, Briefcase, Mail, Building2, X, ClipboardList, HelpCircle } from 'lucide-react';
import { useAuth } from '../../store/AuthContext';
import { authToast } from '../../lib/authToast';

const studentNavItems = [
  { icon: Home,      label: 'My Dashboard', to: '/dashboard'     },
  { icon: Layers,    label: 'Programs',     to: '/programs'      },
  { icon: BookOpen,  label: 'My Courses',   to: '/my-courses'    },
  { icon: ClipboardList, label: 'My Assignments', to: '/my-assignments' },
  { icon: HelpCircle,  label: 'My Quizzes',   to: '/my-quizzes'    },
  { icon: Code2,          label: 'Coding Tests',   to: '/my-coding'      },
  { icon: ClipboardCheck, label: 'My Assessments', to: '/my-assessments' },
  { icon: Calendar,  label: 'Attendance',   to: '/my-attendance' },
  { icon: Video,     label: 'Mock Interviews', to: '/my-mock-interviews' },
  { icon: Wallet,    label: 'My Fees',      to: '/my-fees'       },
  { icon: Briefcase, label: 'Placement',    to: '/my-placements' },
  { icon: Mail,      label: 'My Grievances',to: '/my-grievances' },
];

interface StudentSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function StudentSidebar({ isOpen = false, onClose }: StudentSidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    authToast.signedOut();
    navigate('/login');
  }

  const initials = user?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() ?? 'S';

  return (
    <div className={`lms-drawer fixed inset-y-0 left-0 z-50 w-64 shrink-0 bg-[#eff6ff] border-r border-blue-100 h-screen flex flex-col select-none shadow-sm transform lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* Logo */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-center relative">
        <div 
          className="bg-white rounded-lg p-1.5 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => { navigate('/dashboard'); onClose?.(); }}
        >
          <img src="/logo.png" alt="Vtricks Logo" className="h-14 object-contain" />
        </div>
        <button 
          onClick={onClose}
          className="absolute right-4 p-1.5 text-slate-500 hover:text-slate-700 hover:bg-blue-100 rounded-lg lg:hidden"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Student badge */}
      <div className="px-4 py-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs text-blue-700 font-semibold">Student Portal</span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <p className="text-[10px] text-blue-400 uppercase tracking-widest mb-2 px-2">Navigation</p>
        <nav className="space-y-0.5">
          {studentNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `lms-nav-link lms-press flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
                  isActive
                    ? 'is-active bg-blue-600 text-white font-medium shadow-md shadow-blue-500/25'
                    : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                }`
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* User footer */}
      <div className="p-4 border-t border-blue-100">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { navigate('/my-profile'); onClose?.(); }}
            className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold shrink-0 hover:bg-blue-200 transition-colors"
            title="My profile"
          >
            {initials}
          </button>
          <button
            type="button"
            onClick={() => { navigate('/my-profile'); onClose?.(); }}
            className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
            title="My profile"
          >
            <p className="text-sm font-semibold text-slate-900 truncate">{user?.name ?? 'Student'}</p>
            <p className="text-xs text-slate-500 truncate">{user?.email ?? ''}</p>
          </button>
          <button
            onClick={handleLogout}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
