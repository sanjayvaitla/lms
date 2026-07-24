import { NavLink, useNavigate } from 'react-router';
import {
  Home, BookOpen, Users, GraduationCap, ClipboardList,
  HelpCircle, FolderKanban, Briefcase, Calendar, DollarSign,
  MessageSquare, Bot, LogOut, Settings, ChevronDown, UserCheck,
  ShieldCheck, LibraryBig, Video, Code2, ClipboardCheck, Star, FileCheck, Mail, Building2, X, Activity
} from 'lucide-react';
import { useAuth } from '../../store/AuthContext';
import { usePermissions } from '../../store/PermissionsContext';
import type { TrainerPermissions } from '../../types/api';
import { authToast } from '../../lib/authToast';

type NavItem = {
  icon: React.ElementType;
  label: string;
  to: string;
  aiBadge?: boolean;
  viewKey?: keyof TrainerPermissions;
};

const navItems: NavItem[] = [
  { icon: Home,          label: 'Dashboard',        to: '/dashboard' },
  { icon: BookOpen,      label: 'Curriculum master',     to: '/courses',      viewKey: 'canViewCourses' },
  { icon: Users,         label: 'Batch master',      to: '/batches',      viewKey: 'canViewBatches' },
  { icon: LibraryBig,    label: 'Content master',    to: '/content',      viewKey: 'canViewContent' },
  { icon: Video,         label: 'Recordings',        to: '/recordings',   viewKey: 'canViewRecordings' },
  { icon: UserCheck,     label: 'Learner master',    to: '/learners',     viewKey: 'canViewLearners' },
  { icon: GraduationCap, label: 'Trainer master',    to: '/trainers' },
  { icon: ClipboardList,  label: 'Assignment master',  to: '/assignments',  viewKey: 'canViewAssignments' },
  { icon: ClipboardCheck, label: 'Assessment master', to: '/assessments' },
  { icon: HelpCircle,    label: 'Quiz master',       to: '/quizzes',      viewKey: 'canViewQuizzes' },
  { icon: FileCheck,     label: 'Mock interviews',   to: '/mock-interviews' },
  { icon: Code2,         label: 'Coding tests',      to: '/coding-tests' },
  { icon: FolderKanban,  label: 'Project master',    to: '/projects' },
  { icon: Briefcase,     label: 'Placement master',  to: '/placements' },
  { icon: Building2,    label: 'Internship master', to: '/internships' },
  { icon: Star,          label: 'Feedback master',   to: '/feedback-master' },
  { icon: Calendar,      label: 'Attendance master', to: '/attendance',   viewKey: 'canViewAttendance' },
  { icon: DollarSign,    label: 'Fees module',       to: '/fees' },
  { icon: MessageSquare, label: 'Messaging',         to: '/messaging' },
  { icon: Mail,          label: 'Grievance master',  to: '/grievances' },
  { icon: Bot,           label: 'AI chat tutor',     to: '/ai-tutor', aiBadge: true },
];

// Items visible only to SUPER_ADMIN
const superAdminItems = [
  { icon: ShieldCheck, label: 'Account Management', to: '/role-control', adminBadge: true },
  { icon: Activity, label: 'Activity logs', to: '/activity-logs', adminBadge: true },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const { permissions } = usePermissions();
  const navigate = useNavigate();

  // FEES_ADMIN sees only the fees module.
  // For TRAINER role: filter items where viewKey permission is false.
  const visibleNavItems = user?.role === 'FEES_ADMIN'
    ? navItems.filter((item) => item.to === '/fees')
    : navItems.filter((item) => {
        if ((user?.role === 'LD_MANAGER' || user?.role === 'OPERATIONAL_MANAGER') && item.to === '/fees') return false;
        
        if (user?.role === 'TRAINER') {
          const hiddenFromTrainer = ['/fees', '/grievances', '/feedback-master', '/placements', '/trainers'];
          if (hiddenFromTrainer.includes(item.to)) return false;
        }

        // Messaging is only available to roles the backend allows
        if (item.to === '/messaging') {
          const messagingRoles = ['SUPER_ADMIN', 'TRAINER', 'LD_MANAGER'];
          if (!user?.role || !messagingRoles.includes(user.role)) return false;
        }

        // Hide placeholder features from sidebar
        if (item.to === '/projects' || item.to === '/ai-tutor') return false;
        
        if (user?.role !== 'TRAINER') return true;
        if (!item.viewKey) return true;
        if (!permissions) return true;
        return permissions[item.viewKey] !== false;
      });

  async function handleLogout() {
    await logout();
    authToast.signedOut();
    navigate('/login');
  }

  const initials = user?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() ?? 'U';

  return (
    <div className={`lms-drawer fixed inset-y-0 left-0 z-50 w-64 shrink-0 bg-[#f0f9ff] border-r border-sky-200 text-slate-800 h-screen flex flex-col select-none shadow-sm transform lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* Logo */}
      <div className="px-5 py-4 border-b border-sky-200 flex items-center justify-center relative">
        <div 
          className="flex items-center justify-center p-1.5 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => { navigate('/dashboard'); onClose?.(); }}
        >
          <img src="/logo.png" alt="Vtricks Logo" className="h-14 object-contain" />
        </div>
        <button 
          onClick={onClose}
          className="absolute right-4 p-1.5 text-slate-500 hover:text-slate-700 hover:bg-sky-100 rounded-lg lg:hidden"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Viewing as */}
      <div className="px-4 py-3">
        <p className="text-[10px] text-sky-600/70 font-bold uppercase tracking-widest mb-1.5">Viewing as</p>
        <button className="w-full bg-white border border-sky-200 rounded-lg px-3 py-2 flex items-center justify-between hover:bg-sky-50 transition-colors shadow-sm">
          <span className="text-sm text-slate-700 font-bold">
            {user?.role === 'LD_MANAGER' ? 'L&D Manager' : user?.role === 'OPERATIONAL_MANAGER' ? 'Ops Manager' : user?.role === 'FEES_ADMIN' ? 'Fee Manager' : user?.role?.replace('_', ' ') ?? 'Admin'}
          </span>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <p className="text-[10px] text-sky-600/70 font-bold uppercase tracking-widest mb-2 px-2">Navigation</p>
        <nav className="space-y-0.5">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `lms-nav-link lms-press flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
                  isActive
                    ? 'is-active bg-orange-500 text-white font-bold shadow-md shadow-orange-500/20'
                    : 'text-slate-600 hover:bg-white hover:text-orange-600 font-medium'
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

        {/* Management section */}
        {(user?.role === 'SUPER_ADMIN' || user?.role === 'LD_MANAGER') && (
          <div className="mt-4">
            <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest mb-2 px-2 flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3" /> Management
            </p>
            <nav className="space-y-0.5">
              {superAdminItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                      isActive
                        ? 'bg-rose-500 text-white font-bold shadow-md shadow-rose-500/20'
                        : 'text-slate-600 hover:bg-white hover:text-orange-600 font-medium'
                    }`
                  }
                >
                  <item.icon className="w-4.5 h-4.5 shrink-0" />
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  {user?.role === 'SUPER_ADMIN' && item.adminBadge && (
                    <span className="bg-rose-500/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      SA
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </div>

      {/* User footer */}
      <div className="p-4 border-t border-sky-200 bg-sky-100/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{user?.name ?? 'User'}</p>
            <p className="text-xs text-slate-500 truncate">
              {user?.role === 'LD_MANAGER' ? 'L&D Manager' : user?.role?.replace('_', ' ') ?? ''}
            </p>
          </div>
          <div className="flex gap-1">
            <button className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors">
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
