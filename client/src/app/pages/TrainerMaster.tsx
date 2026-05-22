import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus, Search, Users, BookOpen, X, Loader2, Edit, Trash2,
  BarChart2, GraduationCap, Award, Star, Mail, Phone,
  Linkedin, TrendingUp, PlayCircle, ChevronRight, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '../components/ui/skeleton';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import api from '../../lib/axios';
import { INPUT_CLS, LABEL_CLS, ERROR_CLS, STATUS_STYLES, LEVEL_ICON, resolveCardBg, resolveTagStyle } from '../../lib/constants';
import type { Trainer, TrainerCourse } from '../../types/api';

// ── Zod schema ────────────────────────────────────────────────────────────────
const createTrainerSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters'),
  email:    z.string().email('Invalid email'),
  password: z.string().min(8, 'Password min 8 characters'),
  bio:      z.string().optional(),
  skills:   z.string().optional(),
  linkedin: z.string().url('Invalid LinkedIn URL').optional().or(z.literal('')),
  phone:    z.string().optional(),
});
const updateTrainerSchema = z.object({
  name:     z.string().min(2).optional(),
  email:    z.string().email().optional(),
  bio:      z.string().optional(),
  skills:   z.string().optional(),
  linkedin: z.string().url('Invalid LinkedIn URL').optional().or(z.literal('')),
  phone:    z.string().optional(),
});
type CreateTrainerForm = z.infer<typeof createTrainerSchema>;
type UpdateTrainerForm = z.infer<typeof updateTrainerSchema>;

// ── API ───────────────────────────────────────────────────────────────────────
async function fetchTrainers(): Promise<Trainer[]> {
  const { data } = await api.get('/trainers');
  return data.data ?? [];
}
async function fetchTrainer(id: string): Promise<Trainer> {
  const { data } = await api.get(`/trainers/${id}`);
  return data.data;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TrainerMasterPage() {
  const qc = useQueryClient();
  const [search, setSearch]           = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTrainer, setEditTrainer]   = useState<Trainer | null>(null);
  const [profileId, setProfileId]       = useState<string | null>(null);

  const { data: trainers = [], isLoading } = useQuery({
    queryKey: ['trainers'],
    queryFn:  fetchTrainers,
  });

  // Stats
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/trainers/${id}`),
    onSuccess: () => {
      toast.success('Trainer removed');
      qc.invalidateQueries({ queryKey: ['trainers'] });
    },
    onError: () => toast.error('Failed to delete trainer'),
  });

  function handleDelete(id: string, name: string) {
    if (confirm(`Remove trainer "${name}"? Their courses will be unassigned but not deleted.`)) {
      deleteMutation.mutate(id);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trainer master</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Manage instructors, their courses, performance and allocations.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-teal-500 to-emerald-500 rounded-xl hover:opacity-90 shadow-md"
        >
          <Plus className="w-4 h-4" /> Add Trainer
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Trainers', value: totalTrainers,  icon: GraduationCap, color: 'text-teal-600',   bg: 'bg-teal-50' },
          { label: 'Active Now',     value: activeTrainers, icon: PlayCircle,    color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Courses Taught', value: totalCourses,   icon: BookOpen,      color: 'text-blue-600',   bg: 'bg-blue-50' },
          { label: 'Total Students', value: totalStudents,  icon: Users,         color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`${bg} rounded-2xl p-4 border border-white/80 shadow-sm`}>
            <div className={`flex items-center gap-2 ${color} mb-1`}>
              <Icon className="w-4 h-4" />
              <span className="text-xs font-medium">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email or skill..."
          className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 shadow-sm"
        />
      </div>

      {/* Trainer grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
            <GraduationCap className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No trainers found</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-teal-500 to-emerald-500 rounded-xl hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> Add first trainer
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((trainer) => (
            <TrainerCard
              key={trainer.id}
              trainer={trainer}
              onEdit={() => setEditTrainer(trainer)}
              onDelete={() => handleDelete(trainer.id, trainer.name)}
              onProfile={() => setProfileId(trainer.id)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddTrainerModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            qc.invalidateQueries({ queryKey: ['trainers'] });
          }}
        />
      )}
      {editTrainer && (
        <EditTrainerModal
          trainer={editTrainer}
          onClose={() => setEditTrainer(null)}
          onSuccess={() => {
            setEditTrainer(null);
            qc.invalidateQueries({ queryKey: ['trainers'] });
          }}
        />
      )}
      {profileId && (
        <TrainerProfileDrawer
          trainerId={profileId}
          onClose={() => setProfileId(null)}
          onEdit={(t) => { setProfileId(null); setEditTrainer(t); }}
        />
      )}
    </div>
  );
}

// ── Trainer Card ──────────────────────────────────────────────────────────────
function TrainerCard({ trainer, onEdit, onDelete, onProfile }: {
  trainer: Trainer;
  onEdit: () => void;
  onDelete: () => void;
  onProfile: () => void;
}) {
  const initials = trainer.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const skillList = trainer.skills?.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3) ?? [];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 p-5 flex flex-col gap-3">
      {/* Avatar + Name */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-base leading-snug truncate">{trainer.name}</h3>
          <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
            <Mail className="w-3 h-3" /> {trainer.email}
          </p>
          {trainer.activeBatches > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full mt-1">
              <PlayCircle className="w-3 h-3" /> {trainer.activeBatches} active batch{trainer.activeBatches > 1 ? 'es' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Bio */}
      {trainer.bio && (
        <p className="text-xs text-gray-500 line-clamp-2">{trainer.bio}</p>
      )}

      {/* Skills */}
      {skillList.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skillList.map((skill) => (
            <span key={skill} className="text-[11px] font-medium px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-100 rounded-full">
              {skill}
            </span>
          ))}
          {(trainer.skills?.split(',').length ?? 0) > 3 && (
            <span className="text-[11px] text-gray-400 py-0.5">+{(trainer.skills?.split(',').length ?? 0) - 3} more</span>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="bg-blue-50 rounded-xl p-2.5 text-center">
          <p className="text-lg font-bold text-gray-900">{trainer.courseCount}</p>
          <p className="text-[10px] text-gray-500">Courses</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-2.5 text-center">
          <p className="text-lg font-bold text-gray-900">{trainer.studentCount}</p>
          <p className="text-[10px] text-gray-500">Students</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onProfile}
          className="flex-1 py-2 text-sm font-semibold text-white bg-gradient-to-r from-teal-500 to-emerald-500 rounded-xl hover:opacity-90 flex items-center justify-center gap-1.5"
        >
          Profile <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onEdit}
          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-transparent hover:border-blue-100"
          title="Edit"
        >
          <Edit className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl border border-transparent hover:border-red-100"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Add Trainer Modal ─────────────────────────────────────────────────────────
function AddTrainerModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const {
    register, handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateTrainerForm>({ resolver: zodResolver(createTrainerSchema) });

  async function onSubmit(values: CreateTrainerForm) {
    try {
      await api.post('/trainers', values);
      toast.success('Trainer added!');
      onSuccess();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message ?? 'Something went wrong');
    }
  }

  return <TrainerFormModal title="Add New Trainer" subtitle="Create a trainer account" onClose={onClose} onSubmit={onSubmit} register={register} errors={errors} isSubmitting={isSubmitting} handleSubmit={handleSubmit} showPassword={true} />;
}

// ── Edit Trainer Modal ────────────────────────────────────────────────────────
function EditTrainerModal({ trainer, onClose, onSuccess }: {
  trainer: Trainer;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const {
    register, handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateTrainerForm>({
    resolver: zodResolver(updateTrainerSchema),
    defaultValues: {
      name:     trainer.name,
      email:    trainer.email,
      bio:      trainer.bio ?? '',
      skills:   trainer.skills ?? '',
      linkedin: trainer.linkedin ?? '',
      phone:    trainer.phone ?? '',
    },
  });

  async function onSubmit(values: UpdateTrainerForm) {
    try {
      await api.put(`/trainers/${trainer.id}`, values);
      toast.success('Trainer updated!');
      onSuccess();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message ?? 'Something went wrong');
    }
  }

  return <TrainerFormModal title="Edit Trainer" subtitle="Update trainer information" onClose={onClose} onSubmit={onSubmit} register={register} errors={errors} isSubmitting={isSubmitting} handleSubmit={handleSubmit} showPassword={false} />;
}

// ── Shared Form Modal ─────────────────────────────────────────────────────────
interface TrainerFormModalProps {
  title: string;
  subtitle: string;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSubmit: (values: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: any;
  isSubmitting: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleSubmit: any;
  showPassword: boolean;
}
function TrainerFormModal({ title, subtitle, onClose, onSubmit, register, errors, isSubmitting, handleSubmit, showPassword }: TrainerFormModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Full Name *</label>
              <input {...register('name')} placeholder="e.g. Rajesh Kumar" className={INPUT_CLS} />
              {errors.name && <p className={ERROR_CLS}>{errors.name.message}</p>}
            </div>
            <div>
              <label className={LABEL_CLS}>Email *</label>
              <input {...register('email')} type="email" placeholder="trainer@vtricks.in" className={INPUT_CLS} />
              {errors.email && <p className={ERROR_CLS}>{errors.email.message}</p>}
            </div>
          </div>

          {showPassword && (
            <div>
              <label className={LABEL_CLS}>Password *</label>
              <input {...register('password')} type="password" placeholder="Min 8 characters" className={INPUT_CLS} />
              {errors.password && (
                <p className={ERROR_CLS}>{errors.password.message}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Phone</label>
              <input {...register('phone')} placeholder="+91 9876543210" className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>LinkedIn URL</label>
              <input {...register('linkedin')} placeholder="https://linkedin.com/in/..." className={INPUT_CLS} />
              {errors.linkedin && <p className={ERROR_CLS}>{errors.linkedin.message}</p>}
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>Skills <span className="text-gray-400 font-normal">(comma-separated)</span></label>
            <input {...register('skills')} placeholder="React, Node.js, Python, SQL" className={INPUT_CLS} />
          </div>

          <div>
            <label className={LABEL_CLS}>Bio</label>
            <textarea {...register('bio')} rows={3} placeholder="Brief professional bio..." className={INPUT_CLS + ' resize-none'} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-teal-500 to-emerald-500 rounded-xl hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {showPassword ? 'Create Trainer' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Trainer Profile Drawer ────────────────────────────────────────────────────
function TrainerProfileDrawer({ trainerId, onClose, onEdit }: {
  trainerId: string;
  onClose: () => void;
  onEdit: (t: Trainer) => void;
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
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
        </div>
      </div>
    );
  }

  const initials = trainer.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const skillList = trainer.skills?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-y-auto">

        {/* Header */}
        <div className="p-6 border-b bg-gradient-to-r from-teal-50 to-emerald-50">
          <div className="flex justify-end mb-3">
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-white font-bold text-2xl shrink-0">
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
          {trainer.bio && (
            <p className="text-sm text-gray-600 mt-3 leading-relaxed">{trainer.bio}</p>
          )}
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
            { label: 'Courses',  value: trainer.courseCount,  icon: BookOpen,      color: 'text-blue-600'   },
            { label: 'Students', value: trainer.studentCount, icon: Users,         color: 'text-purple-600' },
            { label: 'Active',   value: trainer.activeBatches, icon: PlayCircle,   color: 'text-emerald-600'},
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
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-xs font-medium transition-colors ${
                tab === t ? 'border-b-2 border-teal-500 text-teal-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div className="flex-1 p-5 space-y-3">
          {tab === 'courses' && (
            <>
              {!trainer.courses || trainer.courses.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No courses assigned yet
                </div>
              ) : (
                trainer.courses.map((course) => (
                  <CourseRow key={course.id} course={course} />
                ))
              )}
            </>
          )}

          {tab === 'performance' && (
            <div className="space-y-4">
              {/* Enrollment trend */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h3 className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-teal-500" /> Enrollment Trend (last 6 months)
                </h3>
                {!trainer.enrollmentTrend || trainer.enrollmentTrend.length === 0 ? (
                  <div className="text-center py-4 text-gray-300 text-xs">No enrollment data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={trainer.enrollmentTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      <Line type="monotone" dataKey="count" stroke="#14b8a6" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Performance summary */}
              {trainer.courses && trainer.courses.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-600">Course Performance</p>
                  {trainer.courses.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{c.title}</p>
                        <p className="text-[10px] text-gray-400">{c.studentCount} students</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">{c.completionPct}%</p>
                        <p className="text-[10px] text-gray-400">avg completion</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'skills' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {skillList.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4">No skills listed yet</p>
                ) : (
                  skillList.map((skill, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 bg-teal-50 text-teal-700 border border-teal-100 rounded-full"
                    >
                      <Star className="w-3 h-3" /> {skill}
                    </span>
                  ))
                )}
              </div>

              {/* Trainer since */}
              <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 text-gray-600 mb-2">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm font-medium">Trainer Since</span>
                </div>
                <p className="text-sm text-gray-700">
                  {new Date(trainer.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-5 border-t flex gap-3">
          <button
            onClick={() => onEdit(trainer)}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-teal-500 to-emerald-500 rounded-xl hover:opacity-90 flex items-center justify-center gap-2"
          >
            <Edit className="w-4 h-4" /> Edit Trainer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Course Row in Profile ─────────────────────────────────────────────────────
function CourseRow({ course }: { course: TrainerCourse }) {
  const cardBg   = resolveCardBg(course.colorToken, course.category);
  const tagStyle = resolveTagStyle(course.colorToken, course.category);

  return (
    <div className={`rounded-xl border p-3 ${cardBg}`}>
      <div className="flex items-start justify-between mb-2">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tagStyle}`}>
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
        <div className="h-full bg-teal-500 rounded-full" style={{ width: `${course.completionPct}%` }} />
      </div>
    </div>
  );
}
