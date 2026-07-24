import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, Search, GraduationCap, Mail, Phone,
  BookOpen, Users, PlayCircle, Star, Linkedin,
  ChevronRight, X, Loader2, Trash2, Calendar,
  TrendingUp, BarChart3, Crown, UserCog, AlertTriangle,
  CheckCircle2, ToggleLeft, ToggleRight, Lock, Unlock,
  BookMarked, ClipboardList, HelpCircle, CalendarCheck,
  Save, RotateCcw, Info, Eye, EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '../components/ui/skeleton';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import api from '../../lib/axios';
import { useAuth } from '../../store/AuthContext';
import { STATUS_STYLES, LEVEL_ICON, resolveCardBg, resolveTagStyle } from '../../lib/constants';
import type { Trainer, TrainerCourse, TrainerPermissions } from '../../types/api';

// ── API helpers ───────────────────────────────────────────────────────────────
async function fetchTrainers(): Promise<Trainer[]> {
  const { data } = await api.get('/trainers');
  return data.data ?? [];
}
async function fetchTrainer(id: string): Promise<Trainer> {
  const { data } = await api.get(`/trainers/${id}`);
  return data.data;
}
async function fetchAllPermissions(): Promise<TrainerPermissions[]> {
  const { data } = await api.get('/permissions/trainers');
  return data.data ?? [];
}
async function fetchPermissions(trainerId: string): Promise<TrainerPermissions> {
  const { data } = await api.get(`/permissions/trainers/${trainerId}`);
  return data.data;
}

interface RoleUser {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'TRAINER' | 'STUDENT' | 'LD_MANAGER' | 'OPERATIONAL_MANAGER' | 'FEES_ADMIN';
  createdAt: string;
  accountStatus?: string;
}


async function createUserAccount(data: any): Promise<any> {
  const res = await api.post('/roles/users', data);
  return res.data.data;
}

async function changeUserPassword(userId: string, password: string): Promise<any> {
  const res = await api.put(`/roles/users/${userId}/password`, { password });
  return res.data;
}

async function toggleUserStatus(userId: string, action: 'ACTIVATE' | 'DEACTIVATE'): Promise<any> {
  const res = await api.put(`/roles/users/${userId}/status`, { action });
  return res.data;
}

async function fetchAllUsers(): Promise<RoleUser[]> {
  const { data } = await api.get('/roles/users');
  return data.data ?? [];
}

async function assignUserRole(userId: string, role: string): Promise<RoleUser> {
  const { data } = await api.put(`/roles/users/${userId}`, { role });
  return data.data;
}

// ── Permission feature definitions ───────────────────────────────────────────
interface FeatureGroup {
  label:    string;
  icon:     React.ElementType;
  color:    string;
  viewKey?: keyof TrainerPermissions;
  features: { key: keyof TrainerPermissions; label: string; desc: string }[];
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    label: 'Curriculum Master',
    icon:  BookOpen,
    color: 'text-blue-600',
    viewKey: 'canViewCourses',
    features: [
      { key: 'canEditCourses',   label: 'Edit Courses',   desc: 'Create & update course details' },
      { key: 'canDeleteCourses', label: 'Delete Courses', desc: 'Remove courses from the system' },
    ],
  },
  {
    label: 'Batch Master',
    icon:  Users,
    color: 'text-purple-600',
    viewKey: 'canViewBatches',
    features: [
      { key: 'canEditBatches',   label: 'Edit Batches',   desc: 'Create & update batch details' },
      { key: 'canDeleteBatches', label: 'Delete Batches', desc: 'Remove batches from the system' },
    ],
  },
  {
    label: 'Content Master',
    icon:  BookMarked,
    color: 'text-cyan-600',
    viewKey: 'canViewContent',
    features: [],
  },
  {
    label: 'Recordings',
    icon:  PlayCircle,
    color: 'text-rose-600',
    viewKey: 'canViewRecordings',
    features: [],
  },
  {
    label: 'Learner Master',
    icon:  GraduationCap,
    color: 'text-teal-600',
    viewKey: 'canViewLearners',
    features: [
      { key: 'canEditLearners',   label: 'Edit Learners',   desc: 'Update learner profiles & enrollments' },
      { key: 'canDeleteLearners', label: 'Delete Learners', desc: 'Remove learners from the system' },
    ],
  },
  {
    label: 'Assignment Master',
    icon:  ClipboardList,
    color: 'text-orange-600',
    viewKey: 'canViewAssignments',
    features: [
      { key: 'canEditAssignments',   label: 'Edit Assignments',   desc: 'Create & update assignments' },
      { key: 'canDeleteAssignments', label: 'Delete Assignments', desc: 'Remove assignments' },
    ],
  },
  {
    label: 'Quiz Master',
    icon:  HelpCircle,
    color: 'text-pink-600',
    viewKey: 'canViewQuizzes',
    features: [
      { key: 'canEditQuizzes',   label: 'Edit Quizzes',   desc: 'Create & update quizzes' },
      { key: 'canDeleteQuizzes', label: 'Delete Quizzes', desc: 'Remove quizzes' },
    ],
  },
  {
    label: 'Attendance Master',
    icon:  CalendarCheck,
    color: 'text-emerald-600',
    viewKey: 'canViewAttendance',
    features: [
      { key: 'canEditAttendance',   label: 'Edit Attendance',   desc: 'Create & update sessions' },
      { key: 'canDeleteAttendance', label: 'Delete Attendance', desc: 'Remove attendance sessions' },
    ],
  },
];

const SOFT_DELETE_FEATURE = {
  key:   'canSoftDeleteOnly' as keyof TrainerPermissions,
  label: 'Soft Delete Only',
  desc:  'When ON, trainer can only archive/soft-delete — not permanently delete records',
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RoleControlPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch]         = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileId, setProfileId]   = useState<string | null>(null);
  const [activeTab, setActiveTab]   = useState<'permissions' | 'roles' | 'create'>(user?.role === 'LD_MANAGER' ? 'create' : 'permissions');

  const { data: trainers = [], isLoading: loadingTrainers } = useQuery({
    queryKey: ['trainers'],
    queryFn:  fetchTrainers,
  });

  const { data: allPerms = [] } = useQuery({
    queryKey: ['permissions', 'all'],
    queryFn:  fetchAllPermissions,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/trainers/${id}`),
    onSuccess: () => {
      toast.success('Trainer removed');
      qc.invalidateQueries({ queryKey: ['trainers'] });
    },
    onError: () => toast.error('Failed to remove trainer'),
  });

  if (user?.role !== 'SUPER_ADMIN' && user?.role !== 'LD_MANAGER') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-20 h-20 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center">
          <ShieldCheck className="w-10 h-10 text-rose-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-800">Access Restricted</h2>
        <p className="text-gray-500 text-sm text-center max-w-xs">
          This section is only accessible to Super Admins.
        </p>
      </div>
    );
  }

  // Build a quick lookup map: trainerId → permissions
  const permsMap = Object.fromEntries(allPerms.map((p) => [p.trainerId, p]));

  const totalTrainers  = trainers.length;
  const activeTrainers = trainers.filter((t) => t.activeBatches > 0).length;
  const totalCourses   = trainers.reduce((a, t) => a + t.courseCount, 0);
  const totalStudents  = trainers.reduce((a, t) => a + t.studentCount, 0);

  const filtered = trainers.filter((t) =>
    !search ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.email.toLowerCase().includes(search.toLowerCase()) ||
    (t.skills ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-200 shrink-0">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">Role Control</h1>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                <Crown className="w-3 h-3" /> {user?.role === 'SUPER_ADMIN' ? 'SUPER ADMIN ONLY' : 'L&D MANAGER'}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-0.5">
              Manage user roles and control which features each trainer can access.
            </p>
          </div>
        </div>
      </div>


      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {user?.role === 'SUPER_ADMIN' && (
          <>
            <button
              onClick={() => setActiveTab('permissions')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'permissions'
                  ? 'bg-white text-rose-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Trainer Permissions
              </span>
            </button>
            <button
              onClick={() => setActiveTab('roles')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'roles'
                  ? 'bg-white text-rose-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <UserCog className="w-3.5 h-3.5" /> Role Assignment
              </span>
            </button>
          </>
        )}
        <button
          onClick={() => setActiveTab('create')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'create'
              ? 'bg-white text-rose-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Manage Accounts
          </span>
        </button>
      </div>


      
      {activeTab === 'create' ? (
        <AccountCreationTab />
      ) : activeTab === 'roles' ? (
        <RoleAssignmentTab />
      ) : (
        <>
      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <span className="font-semibold">How it works:</span> Click a trainer row to open the permission panel.
          Toggle individual features on/off per trainer. Enable <span className="font-semibold">Soft Delete Only</span> to
          prevent permanent deletion — the trainer can only archive records.
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Trainers', value: totalTrainers,  icon: GraduationCap, color: 'text-teal-600',    bg: 'bg-teal-50',    border: 'border-teal-100'    },
          { label: 'Active Now',     value: activeTrainers, icon: PlayCircle,    color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
          { label: 'Courses Taught', value: totalCourses,   icon: BookOpen,      color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-100'    },
          { label: 'Total Students', value: totalStudents,  icon: Users,         color: 'text-purple-600',  bg: 'bg-purple-50',  border: 'border-purple-100'  },
        ].map(({ label, value, icon: Icon, color, bg, border }) => (
          <div key={label} className={`${bg} rounded-2xl p-4 border ${border} shadow-sm`}>
            <div className={`flex items-center gap-2 ${color} mb-1`}>
              <Icon className="w-4 h-4" />
              <span className="text-xs font-medium">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search trainers..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 shadow-sm"
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-teal-500" />
          <span className="text-sm text-gray-600 font-medium">{filtered.length} trainer{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Main layout: table + side panel */}
      <div className="flex gap-5 items-start">

        {/* Trainer list */}
        <div className={`flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-all ${selectedId ? 'max-w-[55%]' : ''}`}>
          {/* Table header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <span>Trainer</span>
            <span className="text-center">Permissions</span>
            <span className="text-center">Soft Delete</span>
            <span className="text-center">Actions</span>
          </div>

          {loadingTrainers ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <GraduationCap className="w-10 h-10 text-gray-200" />
              <p className="text-gray-400 text-sm">No trainers found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map((trainer) => {
                const perms = permsMap[trainer.id];
                const activeCount = perms
                  ? FEATURE_GROUPS.flatMap((g) => g.features).filter((f) => perms[f.key] as boolean).length
                  : 0;
                const totalFeatures = FEATURE_GROUPS.flatMap((g) => g.features).length;
                const isSelected = selectedId === trainer.id;

                return (
                  <div
                    key={trainer.id}
                    onClick={() => setSelectedId(isSelected ? null : trainer.id)}
                    className={`grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-4 items-center cursor-pointer transition-colors ${
                      isSelected ? 'bg-rose-50 border-l-2 border-rose-500' : 'hover:bg-gray-50/60'
                    }`}
                  >
                    {/* Trainer info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {trainer.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{trainer.name}</p>
                        <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                          <Mail className="w-3 h-3 shrink-0" /> {trainer.email}
                        </p>
                      </div>
                    </div>

                    {/* Permission count badge */}
                    <div className="flex justify-center">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        activeCount === 0
                          ? 'bg-gray-100 text-gray-500'
                          : activeCount === totalFeatures
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {activeCount}/{totalFeatures}
                      </span>
                    </div>

                    {/* Soft delete indicator */}
                    <div className="flex justify-center">
                      {perms?.canSoftDeleteOnly ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                          <Lock className="w-3 h-3" /> Soft only
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          <Unlock className="w-3 h-3" /> Full
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setProfileId(trainer.id)}
                        className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                        title="View profile"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remove trainer "${trainer.name}"?`)) deleteMutation.mutate(trainer.id);
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove trainer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Permission panel */}
        {selectedId && (
          <PermissionPanel
            trainerId={selectedId}
            trainer={trainers.find((t) => t.id === selectedId)!}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      {/* Profile drawer */}
      {profileId && (
        <TrainerProfileDrawer
          trainerId={profileId}
          onClose={() => setProfileId(null)}
        />
      )}
        </>
      )}
    </div>
  );
}

// ── Role Assignment Tab ───────────────────────────────────────────────────────
function RoleAssignmentTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['roles', 'users'],
    queryFn:  fetchAllUsers,
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      assignUserRole(userId, role),
    onSuccess: (data) => {
      toast.success(`Role updated to ${data.role} successfully`);
      qc.invalidateQueries({ queryKey: ['roles'] });
      qc.invalidateQueries({ queryKey: ['trainers'] });
      qc.invalidateQueries({ queryKey: ['permissions'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Failed to update role');
    },
  });

  const filtered = users.filter((u) => {
    const matchesSearch = !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const roleCounts = {
    SUPER_ADMIN: users.filter((u) => u.role === 'SUPER_ADMIN').length,
    LD_MANAGER:  users.filter((u) => u.role === 'LD_MANAGER').length,
    ADMIN:       users.filter((u) => u.role === 'ADMIN').length,
    TRAINER:     users.filter((u) => u.role === 'TRAINER').length,
    STUDENT:     users.filter((u) => u.role === 'STUDENT').length,
  };

  const ROLE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
    SUPER_ADMIN: { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200' },
    LD_MANAGER:  { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
    ADMIN:       { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
    TRAINER:     { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200' },
    STUDENT:     { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  };

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-purple-50 border border-purple-200 rounded-2xl">
        <Info className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
        <div className="text-sm text-purple-800">
          <span className="font-semibold">Role Overview:</span> View users and their current roles across the system.
        </div>
      </div>

      {/* Role stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Super Admins', count: roleCounts.SUPER_ADMIN, icon: Crown,          color: 'text-rose-600',   bg: 'bg-rose-50',   border: 'border-rose-100' },
          { label: 'L&D Managers', count: roleCounts.LD_MANAGER,  icon: TrendingUp,     color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
          { label: 'Admins',       count: roleCounts.ADMIN,       icon: ShieldCheck,     color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
          { label: 'Trainers',     count: roleCounts.TRAINER,     icon: GraduationCap,   color: 'text-teal-600',   bg: 'bg-teal-50',   border: 'border-teal-100' },
          { label: 'Students',     count: roleCounts.STUDENT,     icon: Users,           color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-100' },
        ].map(({ label, count, icon: Icon, color, bg, border }) => (
          <div key={label} className={`${bg} rounded-2xl p-4 border ${border} shadow-sm`}>
            <div className={`flex items-center gap-2 ${color} mb-1`}>
              <Icon className="w-4 h-4" />
              <span className="text-xs font-medium">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{count}</p>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name or email..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 shadow-sm"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          {['ALL', 'SUPER_ADMIN', 'LD_MANAGER', 'ADMIN', 'TRAINER', 'STUDENT'].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all border ${
                roleFilter === r
                  ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {r === 'ALL' ? 'All' : r === 'SUPER_ADMIN' ? 'Super Admin' : r === 'LD_MANAGER' ? 'L&D Manager' : r.charAt(0) + r.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Users table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <span>User</span>
          <span className="text-center">Current Role</span>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Users className="w-10 h-10 text-gray-200" />
            <p className="text-gray-400 text-sm">No users found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((u) => {
              const style = ROLE_STYLES[u.role] ?? ROLE_STYLES.STUDENT;
              const isSuperAdmin = u.role === 'SUPER_ADMIN';

              return (
                <div key={u.id} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3.5 items-center hover:bg-gray-50/60 transition-colors">
                  {/* User info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                      isSuperAdmin ? 'bg-gradient-to-br from-rose-400 to-pink-500' :
                      u.role === 'LD_MANAGER' ? 'bg-gradient-to-br from-orange-400 to-red-500' :
                      u.role === 'ADMIN' ? 'bg-gradient-to-br from-purple-400 to-indigo-500' :
                      u.role === 'TRAINER' ? 'bg-gradient-to-br from-teal-400 to-emerald-500' :
                      'bg-gradient-to-br from-blue-400 to-cyan-500'
                    }`}>
                      {u.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{u.name}</p>
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    </div>
                  </div>

                  {/* Current role badge */}
                  <div className="flex justify-center">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${style.bg} ${style.text} ${style.border}`}>
                      {isSuperAdmin ? 'Super Admin' : u.role === 'LD_MANAGER' ? 'L&D Manager' : u.role === 'OPERATIONAL_MANAGER' ? 'Ops Manager' : u.role === 'FEES_ADMIN' ? 'Fee Manager' : u.role.charAt(0) + u.role.slice(1).toLowerCase()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Permission Panel ──────────────────────────────────────────────────────────
function PermissionPanel({ trainerId, trainer, onClose }: {
  trainerId: string;
  trainer: Trainer;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const { data: perms, isLoading } = useQuery({
    queryKey: ['permissions', trainerId],
    queryFn:  () => fetchPermissions(trainerId),
  });

  // Local draft state — only saved when user clicks Save
  const [draft, setDraft] = useState<Partial<TrainerPermissions>>({});

  // Merge server perms with local draft
  const effective = { ...(perms ?? {}), ...draft } as TrainerPermissions;

  const saveMutation = useMutation({
    mutationFn: (body: Partial<TrainerPermissions>) =>
      api.put(`/permissions/trainers/${trainerId}`, body),
    onSuccess: () => {
      toast.success(`Permissions saved for ${trainer.name}`);
      setDraft({});
      qc.invalidateQueries({ queryKey: ['permissions'] });
    },
    onError: () => toast.error('Failed to save permissions'),
  });

  function toggle(key: keyof TrainerPermissions) {
    const current = (draft[key] !== undefined ? draft[key] : perms?.[key]) as boolean;
    setDraft((d) => ({ ...d, [key]: !current }));
  }

  function resetDraft() {
    setDraft({});
  }

  const hasDraft = Object.keys(draft).length > 0;
  const initials = trainer.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="w-80 shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">

      {/* Panel header */}
      <div className="p-4 bg-gradient-to-br from-rose-50 to-pink-50 border-b border-rose-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700">
            <UserCog className="w-3.5 h-3.5" /> Permissions
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{trainer.name}</p>
            <p className="text-xs text-gray-500 truncate">{trainer.email}</p>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : (
          <>
            {/* Soft delete control — top-level, highlighted */}
            <div className={`p-3 rounded-xl border-2 transition-colors ${
              effective.canSoftDeleteOnly
                ? 'bg-amber-50 border-amber-300'
                : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {effective.canSoftDeleteOnly
                    ? <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                    : <Unlock className="w-4 h-4 text-gray-400 shrink-0" />
                  }
                  <div>
                    <p className="text-xs font-bold text-gray-800">{SOFT_DELETE_FEATURE.label}</p>
                    <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{SOFT_DELETE_FEATURE.desc}</p>
                  </div>
                </div>
                <Toggle
                  value={effective.canSoftDeleteOnly ?? true}
                  onChange={() => toggle('canSoftDeleteOnly')}
                  color="amber"
                />
              </div>
            </div>

            {/* Feature groups */}
            {FEATURE_GROUPS.map((group) => {
              const Icon = group.icon;
              const allOn = group.features.length > 0 && group.features.every((f) => effective[f.key] as boolean);
              const sidebarVisible = group.viewKey ? (effective[group.viewKey] as boolean ?? true) : true;
              return (
                <div key={group.label} className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                  {/* Group header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-100">
                    <div className={`flex items-center gap-2 text-xs font-bold ${group.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {group.label}
                    </div>
                    {group.features.length > 0 && (
                      <button
                        onClick={() => {
                          const newVal = !allOn;
                          const patch: Partial<TrainerPermissions> = {};
                          group.features.forEach((f) => {
                            (patch as Record<string, boolean>)[f.key] = newVal;
                          });
                          setDraft((d) => ({ ...d, ...patch }));
                        }}
                        className="text-[10px] font-semibold text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {allOn ? 'Disable all' : 'Enable all'}
                      </button>
                    )}
                  </div>

                  <div className="divide-y divide-gray-100">
                    {/* Sidebar access toggle — first row */}
                    {group.viewKey && (
                      <div className={`flex items-center justify-between px-3 py-2.5 gap-2 ${sidebarVisible ? '' : 'bg-rose-50/40'}`}>
                        <div className="min-w-0 flex items-center gap-2">
                          {sidebarVisible
                            ? <Eye className="w-3 h-3 text-cyan-500 shrink-0" />
                            : <EyeOff className="w-3 h-3 text-rose-400 shrink-0" />}
                          <div>
                            <p className="text-xs font-semibold text-gray-700">Sidebar Access</p>
                            <p className="text-[10px] text-gray-400 leading-tight">
                              {sidebarVisible ? 'Visible in sidebar' : 'Hidden from sidebar'}
                            </p>
                          </div>
                        </div>
                        <Toggle
                          value={sidebarVisible}
                          onChange={() => toggle(group.viewKey!)}
                          color="emerald"
                        />
                      </div>
                    )}

                    {/* Individual edit/delete toggles */}
                    {group.features.map((feature) => (
                      <div key={feature.key} className="flex items-center justify-between px-3 py-2.5 gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-700">{feature.label}</p>
                          <p className="text-[10px] text-gray-400 leading-tight">{feature.desc}</p>
                        </div>
                        <Toggle
                          value={effective[feature.key] as boolean ?? false}
                          onChange={() => toggle(feature.key)}
                          color="blue"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Last updated */}
            {perms?.updatedAt && (
              <p className="text-[10px] text-gray-400 text-center">
                Last updated {new Date(perms.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {perms.updatedByName && ` by ${perms.updatedByName}`}
              </p>
            )}
          </>
        )}
      </div>

      {/* Save / Reset footer */}
      <div className="p-4 border-t border-gray-100 space-y-2">
        {hasDraft && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            Unsaved changes
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={resetDraft}
            disabled={!hasDraft}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-40 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button
            onClick={() => saveMutation.mutate(draft)}
            disabled={!hasDraft || saveMutation.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-rose-500 to-pink-600 rounded-xl hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
          >
            {saveMutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Save className="w-3.5 h-3.5" />
            }
            Save Permissions
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Toggle component ──────────────────────────────────────────────────────────
function Toggle({ value, onChange, color = 'blue' }: {
  value: boolean;
  onChange: () => void;
  color?: 'blue' | 'amber' | 'emerald';
}) {
  const colors = {
    blue:    'bg-blue-500',
    amber:   'bg-amber-500',
    emerald: 'bg-emerald-500',
  };
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
        value ? colors[color] : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

// ── Trainer Profile Drawer ────────────────────────────────────────────────────
function TrainerProfileDrawer({ trainerId, onClose }: {
  trainerId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'courses' | 'performance' | 'skills'>('courses');

  const { data: trainer, isLoading } = useQuery({
    queryKey: ['trainer', trainerId],
    queryFn:  () => fetchTrainer(trainerId),
  });

  if (isLoading || !trainer) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-md bg-white h-full p-6 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
        </div>
      </div>
    );
  }

  const initials  = trainer.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const skillList = trainer.skills?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-y-auto">

        {/* Header */}
        <div className="p-6 border-b bg-gradient-to-br from-rose-50 via-pink-50 to-white">
          <div className="flex justify-between items-start mb-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border bg-teal-100 text-teal-700 border-teal-200">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
              Trainer
            </span>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-white font-bold text-2xl shrink-0 shadow-lg shadow-teal-200">
              {initials}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{trainer.name}</h2>
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                <Mail className="w-3.5 h-3.5" /> {trainer.email}
              </p>
              {trainer.phone && (
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3" /> {trainer.phone}
                </p>
              )}
            </div>
          </div>
          {trainer.bio && <p className="text-sm text-gray-600 mt-3 leading-relaxed">{trainer.bio}</p>}
          {trainer.linkedin && (
            <a href={trainer.linkedin} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-3 text-xs text-blue-600 hover:underline">
              <Linkedin className="w-3.5 h-3.5" /> LinkedIn Profile
            </a>
          )}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3 p-5 border-b">
          {[
            { label: 'Courses',  value: trainer.courseCount,   icon: BookOpen,   color: 'text-blue-600'    },
            { label: 'Students', value: trainer.studentCount,  icon: Users,      color: 'text-purple-600'  },
            { label: 'Active',   value: trainer.activeBatches, icon: PlayCircle, color: 'text-emerald-600' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
              <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
              <p className="text-xl font-bold text-gray-900">{value}</p>
              <p className="text-[10px] text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {(['courses', 'performance', 'skills'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-xs font-medium transition-colors ${
                tab === t ? 'border-b-2 border-rose-500 text-rose-600' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div className="flex-1 p-5 space-y-3">
          {tab === 'courses' && (
            !trainer.courses?.length
              ? <div className="text-center py-8 text-gray-400 text-sm"><BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />No courses assigned</div>
              : trainer.courses.map((c) => <CourseRow key={c.id} course={c} />)
          )}

          {tab === 'performance' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h3 className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-rose-500" /> Enrollment Trend (6 months)
                </h3>
                {!trainer.enrollmentTrend?.length
                  ? <div className="text-center py-4 text-gray-300 text-xs">No data</div>
                  : (
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={trainer.enrollmentTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                        <Line type="monotone" dataKey="count" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )
                }
              </div>
              {trainer.courses?.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{c.title}</p>
                    <p className="text-[10px] text-gray-400">{c.studentCount} students</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{c.completionPct}%</p>
                    <p className="text-[10px] text-gray-400">completion</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'skills' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {skillList.length === 0
                  ? <p className="text-sm text-gray-400 py-4">No skills listed</p>
                  : skillList.map((skill, i) => (
                    <span key={i} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-100 rounded-full">
                      <Star className="w-3 h-3" /> {skill}
                    </span>
                  ))
                }
              </div>
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 text-gray-600 mb-2">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm font-medium">Trainer Since</span>
                </div>
                <p className="text-sm text-gray-700">
                  {new Date(trainer.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Course Row ────────────────────────────────────────────────────────────────
function CourseRow({ course }: { course: TrainerCourse }) {
  return (
    <div className={`rounded-xl border p-3 ${resolveCardBg(course.colorToken, course.category)}`}>
      <div className="flex items-start justify-between mb-2">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${resolveTagStyle(course.colorToken, course.category)}`}>
          {course.category}
        </span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[course.status]}`}>
          {course.status}
        </span>
      </div>
      <p className="text-sm font-bold text-gray-900 truncate">{course.title}</p>
      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {course.studentCount}</span>
        <span className="flex items-center gap-1">{LEVEL_ICON[course.level]} {course.level.toLowerCase()}</span>
        <span className="ml-auto font-semibold text-gray-700">{course.completionPct}%</span>
      </div>
      <div className="mt-2 h-1.5 bg-white/60 rounded-full overflow-hidden">
        <div className="h-full bg-rose-400 rounded-full" style={{ width: `${course.completionPct}%` }} />
      </div>
    </div>
  );
}


// ── Account Creation Tab ──────────────────────────────────────────────────────
function AccountCreationTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(user?.role === 'SUPER_ADMIN' ? 'LD_MANAGER' : 'TRAINER');
  
  const [resetModalId, setResetModalId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['roles', 'users'],
    queryFn: fetchAllUsers,
  });

  const createMutation = useMutation({
    mutationFn: createUserAccount,
    onSuccess: () => {
      toast.success('Account created successfully. An email has been sent to the user to set their password.');
      setName(''); setEmail('');
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Failed to create account');
    }
  });

  const changePwMutation = useMutation({
    mutationFn: (vars: {id: string, pw: string}) => changeUserPassword(vars.id, vars.pw),
    onSuccess: () => {
      toast.success('Password changed successfully');
      setResetModalId(null);
      setNewPassword('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Failed to change password');
    }
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (vars: {id: string, action: 'ACTIVATE' | 'DEACTIVATE'}) => toggleUserStatus(vars.id, vars.action),
    onSuccess: (data, vars) => {
      toast.success(`Account ${vars.action.toLowerCase()}d successfully`);
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Failed to update account status');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/roles/users/${id}`),
    onSuccess: () => {
      toast.success('Account deleted successfully');
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Failed to delete account');
    }
  });

  const allowedRoles = user?.role === 'SUPER_ADMIN' 
    ? [{val: 'SUPER_ADMIN', label: 'Super Admin'}, {val: 'LD_MANAGER', label: 'L&D Manager'}, {val: 'OPERATIONAL_MANAGER', label: 'Ops Manager'}, {val: 'TRAINER', label: 'Trainer'}, {val: 'FEES_ADMIN', label: 'Fee Manager'}]
    : [{val: 'OPERATIONAL_MANAGER', label: 'Ops Manager'}, {val: 'TRAINER', label: 'Trainer'}];

  // Filter users list based on what they can manage
  const managedUsers = users.filter((u) => {
    if (user?.role === 'SUPER_ADMIN') return true;
    if (user?.role === 'LD_MANAGER') return u.role === 'OPERATIONAL_MANAGER' || u.role === 'TRAINER';
    return false;
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-rose-500"/> Create New Account</h2>
        <form onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate({ name, email, role });
        }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name</label>
              <input type="text" required value={name} onChange={e=>setName(e.target.value)} className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
              <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Role</label>
              <select value={role} onChange={e=>setRole(e.target.value)} className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400">
                {allowedRoles.map(r => <option key={r.val} value={r.val}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={createMutation.isPending} className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Create Account'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <h3 className="font-bold text-gray-900 text-sm">Managed Accounts</h3>
        </div>
        <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
          {managedUsers.map(u => (
            <div key={u.id} className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-3.5 items-center hover:bg-gray-50/60 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-sm shrink-0">
                  {u.name.substring(0,2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{u.name}</p>
                  <p className="text-xs text-gray-400 truncate">{u.email}</p>
                </div>
              </div>
              <div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${u.accountStatus === 'BLOCKED' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                  {u.accountStatus === 'BLOCKED' ? 'Deactivated' : u.role}
                </span>
              </div>
              <div className="flex gap-2">
                {u.role === 'STUDENT' && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to ${u.accountStatus === 'BLOCKED' ? 'activate' : 'deactivate'} this student account?`)) {
                        toggleStatusMutation.mutate({ id: u.id, action: u.accountStatus === 'BLOCKED' ? 'ACTIVATE' : 'DEACTIVATE' });
                      }
                    }}
                    disabled={toggleStatusMutation.isPending}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border rounded-lg transition-colors ${
                      u.accountStatus === 'BLOCKED'
                        ? 'text-emerald-600 hover:bg-emerald-50 border-emerald-200'
                        : 'text-rose-600 hover:bg-rose-50 border-rose-200'
                    }`}
                  >
                    {u.accountStatus === 'BLOCKED' ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    {u.accountStatus === 'BLOCKED' ? 'Activate' : 'Deactivate'}
                  </button>
                )}
                <button onClick={() => setResetModalId(u.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors">
                  <Lock className="w-3.5 h-3.5"/> Reset Password
                </button>
                {user?.role === 'SUPER_ADMIN' && u.role !== 'SUPER_ADMIN' && (
                  <button onClick={() => {
                    if (window.confirm(`Are you sure you want to completely delete ${u.name}'s account? This action cannot be undone.`)) {
                      deleteMutation.mutate(u.id);
                    }
                  }} disabled={deleteMutation.isPending} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {resetModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white shadow-2xl rounded-2xl p-6">
            <h3 className="font-bold text-gray-900 text-lg mb-4">Reset Password</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">New Password</label>
                <input type="text" value={newPassword} onChange={e=>setNewPassword(e.target.value)} className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-500/20" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setResetModalId(null)} className="flex-1 py-2 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50">Cancel</button>
                <button onClick={() => changePwMutation.mutate({id: resetModalId, pw: newPassword})} disabled={!newPassword || changePwMutation.isPending} className="flex-1 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 hover:bg-blue-700 flex items-center justify-center gap-2">
                  {changePwMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Save Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
