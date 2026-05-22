import { NavLink, useNavigate } from 'react-router';
import {
  Home, BookOpen, Users, GraduationCap, ClipboardList,
  HelpCircle, FolderKanban, Briefcase, Calendar, DollarSign,
  MessageSquare, Bot, LogOut, Settings, ChevronDown, UserCheck
} from 'lucide-react';
import { useAuth } from '../../store/AuthContext';
import { toast } from 'sonner';

const navItems = [
  { icon: Home,          label: 'Dashboard',        to: '/dashboard' },
  { icon: BookOpen,      label: 'Course master',     to: '/courses' },
  { icon: Users,         label: 'Batch master',      to: '/batches' },
  { icon: UserCheck,     label: 'Learner master',    to: '/learners' },
  { icon: GraduationCap, label: 'Trainer master',    to: '/trainers' },
  { icon: ClipboardList, label: 'Assignment master', to: '/assignments' },
  { icon: HelpCircle,    label: 'Quiz master',       to: '/quizzes' },
  { icon: FolderKanban,  label: 'Project master',    to: '/projects' },
  { icon: Briefcase,     label: 'Placement master',  to: '/placements' },
  { icon: Calendar,      label: 'Attendance master', to: '/attendance' },
  { icon: DollarSign,    label: 'Fees module',       to: '/fees' },
  { icon: MessageSquare, label: 'Messaging',         to: '/messaging' },
  { icon: Bot,           label: 'AI chat tutor',     to: '/ai-tutor', aiBadge: true },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    toast.success('Logged out successfully');
    navigate('/login');
  }

  const initials = user?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() ?? 'U';

  return (
    <div className="w-64 shrink-0 bg-[#0A1628] text-white h-screen flex flex-col select-none">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-cyan-500 rounded-lg flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-white text-sm leading-tight">Vtricks LMS</div>
            <div className="text-[10px] text-cyan-400 font-medium tracking-widest uppercase">EduTech Platform</div>
          </div>
        </div>
      </div>

      {/* Viewing as */}
      <div className="px-4 py-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">Viewing as</p>
        <button className="w-full bg-[#0F1D33] rounded-lg px-3 py-2 flex items-center justify-between hover:bg-[#152235] transition-colors">
          <span className="text-sm text-slate-200">{user?.role?.replace('_', ' ') ?? 'Admin'}</span>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 px-2">Navigation</p>
        <nav className="space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-cyan-500 text-white font-medium shadow-lg shadow-cyan-500/20'
                    : 'text-slate-400 hover:bg-[#0F1D33] hover:text-slate-200'
                }`
              }
            >
              <item.icon className="w-4.5 h-4.5 shrink-0" />
              <span className="flex-1 text-left truncate">{item.label}</span>
              {item.aiBadge && (
                <span className="bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  AI
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* User footer */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-cyan-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name ?? 'User'}</p>
            <p className="text-xs text-slate-400 truncate">{user?.role?.replace('_', ' ') ?? ''}</p>
          </div>
          <div className="flex gap-1">
            <button className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
