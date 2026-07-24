import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router';
import {
  Plus, Search, Filter, BookOpen, Users, Clock, GraduationCap,
  Sparkles, Edit, Trash2, X, Loader2, ChevronRight,
  BarChart2, Calendar, Award, Archive, Upload, FileText, FileSpreadsheet,
  CheckCircle2, ChevronDown, ChevronUp, RotateCcw, Download,
  Layers, FolderOpen, FolderPlus, Link2, Unlink,
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '../components/ui/skeleton';
import api from '../../lib/axios';
import { useAuth } from '../../store/AuthContext';
import { usePermissions } from '../../store/PermissionsContext';
import {
  STATUS_STYLES, LEVEL_ICON,
  COLOR_TOKENS, COLOR_PREVIEW, COLOR_BG_PREVIEW,
  INPUT_CLS, LABEL_CLS, ERROR_CLS,
  resolveCardBg, resolveTagStyle, resolveProgressColor,
} from '../../lib/constants';
import type { Course, CourseStatus, Trainer, SyllabusContent } from '../../types/api';

// ── Program types ─────────────────────────────────────────────────────────────
interface Program {
  id: string; name: string; description?: string;
  color_token: string; is_active: boolean; sort_order: number;
  courses: Course[];
  studentCount?: number;
}

const PROGRAM_COLORS: Record<string, string> = {
  cyan: '#06b6d4', purple: '#8b5cf6', amber: '#f59e0b',
  emerald: '#10b981', rose: '#f43f5e', indigo: '#6366f1',
  sky: '#0ea5e9', orange: '#f97316',
};

const courseSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  category: z.string().default('General'),
  status: z.enum(['ACTIVE', 'NEW', 'DRAFT', 'ARCHIVED']),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
  durationMonths: z.coerce.number().int().min(1, 'Min 1 month').max(24, 'Max 24 months'),
  description: z.string().optional(),
  trainerId: z.string().optional(),
  colorToken: z.enum(COLOR_TOKENS as any),
});
type CourseForm = z.infer<typeof courseSchema>;

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchCourses(search: string, status: string): Promise<Course[]> {
  const params: Record<string, string> = {};
  if (search) params['search'] = search;
  if (status && status !== 'ALL') params['status'] = status;
  const { data } = await api.get('/courses', { params });
  return data.data?.courses ?? data.data ?? [];
}

async function fetchTrainers(): Promise<Trainer[]> {
  const { data } = await api.get('/trainers');
  return data.data ?? [];
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CourseMasterPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { can } = usePermissions();
  const isTrainer = user?.role === 'TRAINER';
  const canEdit = can('canEditCourses');
  const canDelete = can('canDeleteCourses') && !can('canSoftDeleteOnly');
  const canSoftDelete = isTrainer && can('canDeleteCourses') && can('canSoftDeleteOnly');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showAddModal, setShowAddModal] = useState<boolean | string>(false);
  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [manageCourse, setManageCourse] = useState<Course | null>(null);
  const [activeView, setActiveView] = useState<'programs' | 'all'>('programs');
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [editProgram, setEditProgram] = useState<Program | null>(null);

  const { data: programs = [], isLoading: loadingPrograms } = useQuery<Program[]>({
    queryKey: ['programs'],
    queryFn: async () => { const { data } = await api.get('/programs'); return data.data ?? []; },
  });

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['courses', search, statusFilter],
    queryFn: () => fetchCourses(search, statusFilter),
  });

  // ── Two-step delete mutation ───────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (vars: { id: string; isArchived: boolean }) =>
      api.delete(`/courses/${vars.id}`),
    onSuccess: (_, vars) => {
      toast.success(
        vars.isArchived
          ? 'Course permanently deleted'
          : 'Course moved to archive — delete again to remove permanently',
      );
      qc.invalidateQueries({ queryKey: ['courses'] });
    },
    onError: (_, vars) =>
      toast.error(vars.isArchived ? 'Failed to delete course' : 'Failed to archive course'),
  });

  // ── Unarchive mutation ─────────────────────────────────────────────────────
  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/courses/${id}/unarchive`),
    onSuccess: () => {
      toast.success('Course restored to active section');
      qc.invalidateQueries({ queryKey: ['courses'] });
    },
    onError: () => toast.error('Failed to unarchive course'),
  });

  function handleUnarchive(id: string, title: string) {
    if (confirm(`Restore "${title}" to active courses?`)) {
      unarchiveMutation.mutate(id);
    }
  }

  function handleDelete(id: string, title: string, status: CourseStatus) {
    const isArchived = status === 'ARCHIVED';
    if (isArchived) {
      if (
        confirm(
          `Permanently delete "${title}"?\n\nThis will remove all its batches and enrollment records forever. This action cannot be undone.`,
        )
      ) {
        deleteMutation.mutate({ id, isArchived: true });
      }
    } else {
      if (
        confirm(
          `Archive "${title}"?\n\nIt will be hidden from active listings. You can permanently delete it from the Archived filter.`,
        )
      ) {
        deleteMutation.mutate({ id, isArchived: false });
      }
    }
  }

  const activeCourses = React.useMemo(() => courses.filter(c => c.status !== 'ARCHIVED'), [courses]);
  const archivedCourses = React.useMemo(() => courses.filter(c => c.status === 'ARCHIVED'), [courses]);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Curriculum Master</h1>
          <p className="text-gray-500 text-xs sm:text-sm mt-0.5">
            Manage programs and their courses.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
          <div className="flex w-full sm:w-auto gap-1 bg-gray-100 rounded-xl p-1">
            <button onClick={() => setActiveView('programs')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-sm font-medium transition-all ${activeView === 'programs' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Layers className="w-4 h-4" /> Programs
            </button>
            <button onClick={() => setActiveView('all')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-sm font-medium transition-all ${activeView === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <BookOpen className="w-4 h-4" /> All Courses
            </button>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {canEdit && activeView === 'programs' && (
              <button onClick={() => { setEditProgram(null); setShowProgramModal(true); }}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg hover:opacity-90 shadow-md">
                <FolderPlus className="w-4 h-4" /> Add Program
              </button>
            )}
            <button
              onClick={() => toast.info('AI Curriculum Builder — coming soon!')}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-gradient-to-r from-purple-500 to-cyan-500 rounded-lg hover:opacity-90 transition-opacity shadow-md"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="truncate">AI curriculum builder</span>
            </button>
          </div>
        </div>
      </div>


      {/* Programs View */}
      {activeView === 'programs' && (
        <ProgramsView
          programs={programs}
          isLoading={loadingPrograms}
          canEdit={canEdit}
          onEditProgram={(p) => { setEditProgram(p); setShowProgramModal(true); }}
          onManageCourse={(c) => setManageCourse(c)}
          onEditCourse={(c) => setEditCourse(c)}
          onAddCourse={(pid) => setShowAddModal(pid || true)}
          onRefresh={() => qc.invalidateQueries({ queryKey: ['programs'] })}
        />
      )}

      {activeView === 'all' && (
        <>
          {/* ── Search + status filter ───────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search courses by title or category..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all shadow-sm"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap items-center">
              {(['ALL', 'ACTIVE', 'NEW', 'DRAFT', 'ARCHIVED'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all border ${statusFilter === s
                    ? 'bg-cyan-500 text-white border-cyan-500 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                >
                  {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* ── Course grid ──────────────────────────────────────────────────────── */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-72 rounded-2xl" />
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
                <BookOpen className="w-8 h-8 text-gray-300" />
              </div>
              <div className="text-center">
                <p className="text-gray-500 font-medium">No courses found</p>
                <p className="text-gray-400 text-sm mt-1">Try adjusting your search or filters</p>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" /> Add your first course
              </button>
            </div>
          ) : (
            <>
              {/* Active courses */}
              {activeCourses.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {activeCourses.map((course) => (
                    <CourseCard
                      key={course.id}
                      course={course}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      canSoftDelete={canSoftDelete}
                      onDelete={handleDelete}
                      onEdit={() => setEditCourse(course)}
                      onManage={() => setManageCourse(course)}
                    />
                  ))}
                </div>
              )}

              {/* Archived section */}
              {archivedCourses.length > 0 && (
                <ArchivedCoursesSection
                  courses={archivedCourses}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  canSoftDelete={canSoftDelete}
                  onDelete={handleDelete}
                  onEdit={(c) => setEditCourse(c)}
                  onManage={(c) => setManageCourse(c)}
                  onUnarchive={handleUnarchive}
                />
              )}

              {courses.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
                    <BookOpen className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-gray-500 font-medium">No courses match your filters</p>
                </div>
              )}
            </>
          )}

        </>
      )}

      {/* ── Modals / Drawer ───────────────────────────────────────────────────── */}
      {showAddModal && (
        <CourseModal
          mode="add"
          defaultProgramId={typeof showAddModal === 'string' ? showAddModal : undefined}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            qc.invalidateQueries({ queryKey: ['courses'] });
            qc.invalidateQueries({ queryKey: ['programs'] });
          }}
        />
      )}
      {editCourse && (
        <CourseModal
          mode="edit"
          course={editCourse}
          onClose={() => setEditCourse(null)}
          onSuccess={() => {
            setEditCourse(null);
            qc.invalidateQueries({ queryKey: ['courses'] });
          }}
        />
      )}
      {manageCourse && (
        <ManageDrawer course={manageCourse} onClose={() => setManageCourse(null)} />
      )}
      {showProgramModal && (
        <ProgramModal
          program={editProgram}
          onClose={() => { setShowProgramModal(false); setEditProgram(null); }}
          onSuccess={() => { setShowProgramModal(false); setEditProgram(null); qc.invalidateQueries({ queryKey: ['programs'] }); }}
        />
      )}
    </div>
  );
}

// ── Archived Courses Section ──────────────────────────────────────────────────

function ArchivedCoursesSection({ courses, canEdit, canDelete, canSoftDelete, onDelete, onEdit, onManage, onUnarchive }: {
  courses: Course[];
  canEdit: boolean;
  canDelete: boolean;
  canSoftDelete?: boolean;
  onDelete: (id: string, title: string, status: CourseStatus) => void;
  onEdit: (c: Course) => void;
  onManage: (c: Course) => void;
  onUnarchive: (id: string, title: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-4">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors mb-3"
      >
        <Archive className="w-4 h-4 text-gray-400" />
        Archived Courses
        <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">{courses.length}</span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 opacity-75">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              canEdit={canEdit}
              canDelete={canDelete}
              canSoftDelete={canSoftDelete}
              onDelete={onDelete}
              onEdit={() => onEdit(course)}
              onManage={() => onManage(course)}
              onUnarchive={() => onUnarchive(course.id, course.title)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Course Card ───────────────────────────────────────────────────────────────

interface CourseCardProps {
  course: Course;
  canEdit: boolean;
  canDelete: boolean;
  canSoftDelete?: boolean;
  onDelete: (id: string, title: string, status: CourseStatus) => void;
  onEdit: () => void;
  onManage: () => void;
  onUnarchive?: () => void;
}

function CourseCard({ course, canEdit, canDelete, canSoftDelete, onDelete, onEdit, onManage, onUnarchive }: CourseCardProps) {
  const cardBg = resolveCardBg(course.colorToken, course.category);
  const tagStyle = resolveTagStyle(course.colorToken, course.category);
  const progBar = resolveProgressColor(course.colorToken, course.category);
  const completion = course.completionPct ?? 0;
  const isArchived = course.status === 'ARCHIVED';

  return (
    <div
      className={`rounded-2xl border shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col ${cardBg} ${isArchived ? 'opacity-70' : ''}`}
    >
      {/* Top row — category tag + status badge */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${tagStyle}`}>
          {course.category}
        </span>
        <span
          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[course.status]}`}
        >
          {course.status.charAt(0) + course.status.slice(1).toLowerCase()}
        </span>
      </div>

      {/* Title */}
      <div className="px-4 pb-3">
        <h3 className="font-bold text-gray-900 text-base leading-snug line-clamp-2">
          {course.title}
        </h3>
      </div>

      {/* Meta row */}
      <div className="px-4 pb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
        {course.trainer && (
          <span className="flex items-center gap-1">
            <GraduationCap className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            {course.trainer.name}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          {course.studentCount ?? 0} students
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          {course.durationMonths} months
        </span>
        <span className="flex items-center gap-1">
          {LEVEL_ICON[course.level]}{' '}
          {course.level.charAt(0) + course.level.slice(1).toLowerCase()}
        </span>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-4 flex-1 flex flex-col justify-end">
        <div className="flex items-center justify-between mb-1.5 text-xs text-gray-500">
          <span>Course completion</span>
          <span className="font-semibold text-gray-700">{completion}%</span>
        </div>
        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${progBar}`}
            style={{ width: `${completion}%` }}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 px-4 pb-4">
        <button
          onClick={onManage}
          className="flex-1 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl hover:opacity-90 transition-opacity shadow shadow-emerald-500/20 flex items-center justify-center gap-1.5"
        >
          Manage <ChevronRight className="w-3.5 h-3.5" />
        </button>
        {canEdit && (
          <button
            onClick={onEdit}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors border border-transparent hover:border-blue-100"
            title="Edit course"
          >
            <Edit className="w-4 h-4" />
          </button>
        )}
        {/* Archive button — shown when not archived and trainer has delete permission OR is not a trainer */}
        {!isArchived && (canDelete || canSoftDelete) && (
          <button
            onClick={() => onDelete(course.id, course.title, course.status)}
            className="p-2 rounded-xl transition-colors border border-transparent text-gray-500 hover:text-amber-600 hover:bg-amber-50 hover:border-amber-100"
            title="Archive course"
          >
            <Archive className="w-4 h-4" />
          </button>
        )}
        {isArchived && (
          <button
            onClick={onUnarchive}
            className="p-2 rounded-xl transition-colors border border-transparent text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200"
            title="Restore to active"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
        {/* Permanent delete — only when archived AND has full delete permission (not soft-delete-only) */}
        {isArchived && canDelete && (
          <button
            onClick={() => onDelete(course.id, course.title, course.status)}
            className="p-2 rounded-xl transition-colors border border-transparent text-red-500 hover:text-red-700 hover:bg-red-50 hover:border-red-200"
            title="Delete permanently"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────

interface CourseModalProps {
  mode: 'add' | 'edit';
  course?: Course;
  defaultProgramId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

function CourseModal({ mode, course, defaultProgramId, onClose, onSuccess }: CourseModalProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CourseForm>({
    resolver: zodResolver(courseSchema),
    defaultValues:
      mode === 'edit' && course
        ? {
          title: course.title,
          category: course.category,
          status: course.status,
          level: course.level,
          durationMonths: course.durationMonths,
          description: course.description ?? '',
          trainerId: course.trainerId ?? '',
          colorToken: (COLOR_TOKENS.includes(course.colorToken as any)
            ? course.colorToken
            : 'emerald') as typeof COLOR_TOKENS[number],
        }
        : {
          category: 'General',
          status: 'ACTIVE',
          level: 'INTERMEDIATE',
          durationMonths: 3,
          trainerId: '',
          colorToken: 'emerald',
        },
  });

  // watch the live colorToken value — this drives the picker highlight + preview
  const selectedColor = watch('colorToken');

  async function onSubmit(values: CourseForm) {
    try {
      if (mode === 'add') {
        await api.post('/courses', { ...values, programId: defaultProgramId });
        toast.success('Course created successfully!');
      } else {
        await api.put(`/courses/${course!.id}`, values);
        toast.success('Course updated successfully!');
      }
      onSuccess();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message ?? 'Something went wrong');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {mode === 'add' ? 'Add New Course' : 'Edit Course'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {mode === 'add'
                ? 'Fill in the details to create a new course'
                : 'Update the course information below'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">

          {/* CRITICAL: hidden input registers colorToken so watch() works correctly */}
          <input type="hidden" {...register('colorToken')} />

          {/* Title */}
          <div>
            <label className={LABEL_CLS}>Course Title *</label>
            <input
              {...register('title')}
              placeholder="e.g. MERN Stack Full Development"
              className={INPUT_CLS}
            />
            {errors.title && <p className={ERROR_CLS}>{errors.title.message}</p>}
          </div>

          {/* Duration */}
          <div>
            <label className={LABEL_CLS}>Duration (months) *</label>
            <input
              {...register('durationMonths')}
              type="number"
              min={1}
              max={24}
              className={INPUT_CLS}
            />
            {errors.durationMonths && (
              <p className={ERROR_CLS}>{errors.durationMonths.message}</p>
            )}
          </div>

          {/* Status + Level */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Status</label>
              <select {...register('status')} className={INPUT_CLS}>
                <option value="ACTIVE">Active</option>
                <option value="NEW">New</option>
                <option value="DRAFT">Draft</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Level</label>
              <select {...register('level')} className={INPUT_CLS}>
                <option value="BEGINNER">Beginner</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option value="ADVANCED">Advanced</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={LABEL_CLS}>Description</label>
            <textarea
              {...register('description')}
              rows={3}
              placeholder="Brief description of the course..."
              className={INPUT_CLS + ' resize-none'}
            />
          </div>

          {/* Trainer */}
          <TrainerSelectField register={register} defaultValue={mode === 'edit' ? (course?.trainerId ?? '') : ''} />

          {/* Colour Token Picker — fixed: hidden register + setValue + watch */}
          <div>
            <label className={LABEL_CLS}>Card Colour</label>
            <div className="flex gap-2 flex-wrap mt-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
              {COLOR_TOKENS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValue('colorToken', c, { shouldValidate: true, shouldDirty: true })}
                  title={c}
                  className={`
                    w-8 h-8 rounded-full border-2 transition-all duration-150
                    ${COLOR_PREVIEW[c]}
                    ${selectedColor === c
                      ? 'border-gray-700 scale-110 shadow-md'
                      : 'border-transparent hover:border-gray-300 hover:scale-105'}
                  `}
                />
              ))}
            </div>
            {/* Live preview strip */}
            <div className={`mt-2 px-3 py-2 rounded-lg border text-xs font-medium text-gray-600 transition-all ${COLOR_BG_PREVIEW[selectedColor as typeof COLOR_TOKENS[number]] ?? 'bg-gray-50 border-gray-100'}`}>
              Preview — card will appear in{' '}
              <span className="font-bold capitalize">{selectedColor}</span>
            </div>
            {errors.colorToken && <p className={ERROR_CLS}>{errors.colorToken.message as string}</p>}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'add' ? 'Create Course' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Manage Drawer ─────────────────────────────────────────────────────────────

interface ManageDrawerProps {
  course: Course;
  onClose: () => void;
}

function ManageDrawer({ course, onClose }: ManageDrawerProps) {
  const [drawerTab, setDrawerTab] = useState<'overview' | 'syllabus'>('overview');
  const navigate = useNavigate();
  const cardBg = resolveCardBg(course.colorToken, course.category);
  const tagStyle = resolveTagStyle(course.colorToken, course.category);
  const progBar = resolveProgressColor(course.colorToken, course.category);
  const completion = course.completionPct ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-y-auto">

        {/* Header */}
        <div className={`p-6 border-b ${cardBg}`}>
          <div className="flex items-start justify-between mb-3">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${tagStyle}`}>
              {course.category}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <h2 className="text-xl font-bold text-gray-900 leading-snug">{course.title}</h2>
          {course.description && (
            <p className="text-sm text-gray-500 mt-2">{course.description}</p>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-gray-100">
          {(['overview', 'syllabus'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setDrawerTab(t)}
              className={`flex-1 py-3 text-xs font-medium transition-colors ${drawerTab === t
                ? 'border-b-2 border-cyan-500 text-cyan-600'
                : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              {t === 'overview' ? 'Overview' : 'Syllabus'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {drawerTab === 'syllabus' ? (
            <SyllabusTab courseId={course.id} />
          ) : (
            <>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: Users, label: 'Students', value: course.studentCount ?? 0 },
                  { icon: BarChart2, label: 'Batches', value: course.batchCount ?? 0 },
                  { icon: Clock, label: 'Months', value: course.durationMonths },
                ].map(({ icon: Icon, label, value }) => (
                  <div
                    key={label}
                    className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100"
                  >
                    <Icon className="w-4 h-4 text-gray-400 mx-auto mb-1" />
                    <p className="text-xl font-bold text-gray-900">{value}</p>
                    <p className="text-[10px] text-gray-500">{label}</p>
                  </div>
                ))}
              </div>

              {/* Completion bar */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-amber-500" /> Course Completion
                  </span>
                  <span className="text-sm font-bold text-gray-900">{completion}%</span>
                </div>
                <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${progBar}`}
                    style={{ width: `${completion}%` }}
                  />
                </div>
              </div>

              {/* Course details */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Course Details</h3>
                {[
                  {
                    label: 'Status',
                    value: course.status.charAt(0) + course.status.slice(1).toLowerCase(),
                  },
                  {
                    label: 'Level',
                    value: `${LEVEL_ICON[course.level]} ${course.level.charAt(0) + course.level.slice(1).toLowerCase()
                      }`,
                  },
                  { label: 'Trainer', value: course.trainer?.name ?? 'Not assigned' },
                  { label: 'Duration', value: `${course.durationMonths} months` },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                  >
                    <span className="text-sm text-gray-500">{label}</span>
                    <span className="text-sm font-medium text-gray-800">{value}</span>
                  </div>
                ))}
              </div>

              {/* Quick actions */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => navigate(`/batches?courseId=${course.id}`)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-cyan-50 border border-cyan-100 text-cyan-700 rounded-xl hover:bg-cyan-100 transition-colors text-sm font-medium"
                >
                  <span className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> View Batches
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => navigate(`/batches?courseId=${course.id}&view=enrollments`)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-purple-50 border border-purple-100 text-purple-700 rounded-xl hover:bg-purple-100 transition-colors text-sm font-medium"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4" /> Manage Enrollments
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => navigate(`/courses/${course.id}/analytics`)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-100 text-amber-700 rounded-xl hover:bg-amber-100 transition-colors text-sm font-medium"
                >
                  <span className="flex items-center gap-2">
                    <BarChart2 className="w-4 h-4" /> View Analytics
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// -- Trainer Select Field --
function TrainerSelectField({ register, defaultValue }: {
  register: ReturnType<typeof useForm<CourseForm>>["register"];
  defaultValue: string;
}) {
  const { data: trainers = [] } = useQuery({
    queryKey: ["trainers-select"],
    queryFn: fetchTrainers,
    staleTime: 60_000,
  });
  return (
    <>
      <select {...register("trainerId")} defaultValue={defaultValue} className={INPUT_CLS}>
        <option value="" disabled>Select a trainer</option>
        {trainers.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </>
  );
}

// -- Syllabus Tab --
function SyllabusTab({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const { data: syllabi = [], isLoading } = useQuery<SyllabusContent[]>({
    queryKey: ['syllabi', courseId],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}/syllabus`);
      return data.data ?? [];
    },
  });

  // Auto-select latest when list loads
  React.useEffect(() => {
    if (syllabi.length && !selectedId) setSelectedId(syllabi[0].id);
  }, [syllabi, selectedId]);

  const selected = syllabi.find(s => s.id === selectedId) ?? syllabi[0] ?? null;

  async function handleUpload(file: File) {
    const nameOk = /\.(pdf|xlsx|xls|csv)$/i.test(file.name);
    if (!nameOk) { toast.error('Only PDF, Excel (.xlsx/.xls), or CSV allowed'); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('syllabus', file);
      if (labelInput.trim()) form.append('label', labelInput.trim());
      const { data } = await api.post(`/courses/${courseId}/syllabus`, form);
      toast.success('Syllabus uploaded!');
      qc.invalidateQueries({ queryKey: ['syllabi', courseId] });
      setSelectedId(data.data.id);
      setActiveSheet(0);
      setExpandedSessions(new Set());
      setLabelInput('');
      setShowUpload(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this syllabus version?')) return;
    try {
      await api.delete(`/courses/${courseId}/syllabus/${id}`);
      toast.success('Deleted');
      qc.invalidateQueries({ queryKey: ['syllabi', courseId] });
      if (selectedId === id) setSelectedId(syllabi.find(s => s.id !== id)?.id ?? null);
    } catch { toast.error('Delete failed'); }
  }

  function toggleSession(key: string) {
    setExpandedSessions(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  if (isLoading) return (
    <div className="space-y-3"><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-4 rounded" /><Skeleton className="h-4 w-3/4 rounded" /></div>
  );

  const sheetColors = ['from-blue-500 to-cyan-500', 'from-purple-500 to-pink-500', 'from-emerald-500 to-teal-500', 'from-orange-500 to-amber-500', 'from-rose-500 to-red-500'];
  const sheetBg = ['bg-blue-50 border-blue-200 text-blue-700', 'bg-purple-50 border-purple-200 text-purple-700', 'bg-emerald-50 border-emerald-200 text-emerald-700', 'bg-orange-50 border-orange-200 text-orange-700', 'bg-rose-50 border-rose-200 text-rose-700'];

  const structured = selected?.structuredData;
  const currentSheet = structured?.sheets[activeSheet];
  const totalDuration = currentSheet?.sessions.reduce((a, s) => a + (s.duration ?? 0), 0) ?? 0;

  return (
    <div className="space-y-4">

      {/* Header row — version list + add button */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {syllabi.length} version{syllabi.length !== 1 ? 's' : ''} uploaded
        </p>
        <button onClick={() => setShowUpload(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add version
        </button>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div className="rounded-xl border border-dashed border-cyan-300 bg-cyan-50/40 p-4 space-y-3">
          <input
            type="text" placeholder="Version label (e.g. v2, Jan 2026 Batch)…"
            value={labelInput} onChange={e => setLabelInput(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-300"
          />
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
            onClick={() => fileRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-all ${dragOver ? 'border-cyan-400 bg-cyan-100' : 'border-gray-200 hover:border-cyan-300 hover:bg-gray-50'}`}
          >
            <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-7 h-7 text-cyan-500 animate-spin" />
                <p className="text-sm text-gray-600">Processing…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="flex gap-3 items-center">
                  <FileText className="w-5 h-5 text-red-400" />
                  <FileSpreadsheet className="w-5 h-5 text-green-500" />
                  <span className="text-xs text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">CSV</span>
                </div>
                <p className="text-sm font-semibold text-gray-700">Drop file or click to browse</p>
                <p className="text-xs text-gray-400">PDF · Excel (.xlsx) · CSV</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Version list */}
      {syllabi.length > 0 && (
        <div className="space-y-1.5">
          {syllabi.map((s, idx) => {
            const isSelected = s.id === selected?.id;
            const isLatest = idx === 0;
            return (
              <div key={s.id}
                onClick={() => { setSelectedId(s.id); setActiveSheet(0); setExpandedSessions(new Set()); }}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'border-cyan-300 bg-cyan-50 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                  }`}>
                {s.fileType === 'PDF'
                  ? <FileText className="w-4 h-4 text-red-400 shrink-0" />
                  : <FileSpreadsheet className="w-4 h-4 text-green-500 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-800 truncate">{s.label ?? s.filename}</p>
                    {isLatest && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold shrink-0">Latest</span>}
                  </div>
                  <p className="text-xs text-gray-400 truncate">
                    {s.filename} · {s.fileType} · {new Date(s.createdAt).toLocaleDateString()}{s.uploadedByName ? ` by ${s.uploadedByName}` : ''}
                  </p>
                </div>
                {isSelected && <div className="w-2 h-2 rounded-full bg-cyan-500 shrink-0" />}
                {s.fileUrl && (
                  <a
                    href={s.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    title="Download original file"
                    className="p-1 text-gray-300 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                )}
                <button onClick={e => { e.stopPropagation(); handleDelete(s.id); }}
                  className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Structured preview for selected version */}
      {selected && structured && (
        <div className="space-y-3 pt-1">
          <div className="h-px bg-gray-100" />

          {/* Sheet tabs */}
          {structured.sheets.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {structured.sheets.map((sheet, idx) => (
                <button key={idx}
                  onClick={() => { setActiveSheet(idx); setExpandedSessions(new Set()); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${activeSheet === idx
                    ? `bg-gradient-to-r ${sheetColors[idx % sheetColors.length]} text-white border-transparent shadow-sm`
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}>
                  {sheet.name}
                </button>
              ))}
            </div>
          )}

          {currentSheet && (
            <div className="space-y-3">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Sessions', value: currentSheet.sessions.length },
                  { label: 'Hours', value: totalDuration ? (totalDuration / 60).toFixed(1) + 'h' : '—' },
                  { label: 'Topics', value: currentSheet.sessions.reduce((a, s) => a + s.topics.length, 0) },
                ].map(stat => (
                  <div key={stat.label} className={`rounded-xl p-3 border ${sheetBg[activeSheet % sheetBg.length]}`}>
                    <p className="text-xs font-medium opacity-70">{stat.label}</p>
                    <p className="text-xl font-bold">{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* Expand/Collapse */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800">{currentSheet.courseTitle}</h3>
                <div className="flex gap-2">
                  <button onClick={() => setExpandedSessions(new Set(currentSheet.sessions.map(s => String(s.session))))}
                    className="text-xs text-cyan-600 hover:text-cyan-700 font-medium flex items-center gap-1">
                    <ChevronDown className="w-3.5 h-3.5" /> Expand all
                  </button>
                  <span className="text-gray-300">|</span>
                  <button onClick={() => setExpandedSessions(new Set())}
                    className="text-xs text-gray-500 hover:text-gray-600 font-medium flex items-center gap-1">
                    <ChevronUp className="w-3.5 h-3.5" /> Collapse all
                  </button>
                </div>
              </div>

              {/* Session cards */}
              <div className="space-y-2">
                {currentSheet.sessions.map((sess, sidx) => {
                  const key = String(sess.session);
                  const isOpen = expandedSessions.has(key);
                  const ci = activeSheet % sheetColors.length;
                  return (
                    <div key={sidx} className="rounded-xl border border-gray-100 overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
                      <button onClick={() => toggleSession(key)}
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors">
                        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${sheetColors[ci]} flex items-center justify-center shrink-0`}>
                          <span className="text-white text-xs font-bold">{String(sess.session).length <= 3 ? sess.session : sidx + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{sess.module}</p>
                          <p className="text-xs text-gray-400">{sess.topics.length} topic{sess.topics.length !== 1 ? 's' : ''}</p>
                        </div>
                        {sess.duration && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ${sheetBg[ci]}`}>{sess.duration} min</span>
                        )}
                        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen && sess.topics.length > 0 && (
                        <div className="px-4 pb-3 pt-0 border-t border-gray-50 bg-gray-50/50">
                          <ul className="space-y-1.5 mt-2">
                            {sess.topics.map((topic, tidx) => (
                              <li key={tidx} className="flex items-start gap-2 text-xs text-gray-700">
                                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full bg-gradient-to-br ${sheetColors[ci]} shrink-0`} />
                                <span className="leading-relaxed">{topic}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* PDF plain-text fallback */}
      {selected && !structured && (
        <div className="space-y-2 pt-1">
          <div className="h-px bg-gray-100" />
          {selected?.rawText && (
            <pre className="text-xs text-gray-600 bg-gray-50 rounded-xl p-4 border border-gray-100 whitespace-pre-wrap overflow-x-auto max-h-64">
              {selected.rawText}
            </pre>
          )}
        </div>
      )}

    </div>
  );
}


// ── Programs View ─────────────────────────────────────────────────────────────
function ProgramsView({ programs, isLoading, canEdit, onEditProgram, onManageCourse, onEditCourse, onAddCourse, onRefresh }: {
  programs: Program[];
  isLoading: boolean;
  canEdit: boolean;
  onEditProgram: (p: Program) => void;
  onManageCourse: (c: Course) => void;
  onEditCourse: (c: Course) => void;
  onAddCourse: (programId?: string) => void;
  onRefresh: () => void;
}) {
  const qc = useQueryClient();
  const [openPrograms, setOpenPrograms] = useState<Set<string>>(new Set());
  const [assigningTo, setAssigningTo] = useState<Program | null>(null);
  const seededRef = useRef(false);

  // Open all programs once data arrives (state init runs with [] before fetch)
  useEffect(() => {
    if (programs.length === 0) return;
    if (!seededRef.current) {
      setOpenPrograms(new Set(programs.map((p) => p.id)));
      seededRef.current = true;
      return;
    }
    setOpenPrograms((prev) => {
      const valid = new Set(programs.map((p) => p.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [programs]);

  const toggleProgram = (id: string) => {
    setOpenPrograms(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const removeCourseFromProgram = async (programId: string, courseId: string, courseTitle: string) => {
    if (!confirm(`Remove "${courseTitle}" from this program?`)) return;
    try {
      await api.delete(`/programs/${programId}/courses/${courseId}`);
      toast.success('Course removed from program');
      qc.invalidateQueries({ queryKey: ['programs'] });
    } catch { toast.error('Failed'); }
  };

  const deleteProgram = async (p: Program) => {
    if (!confirm(`Delete program "${p.name}"? Courses will not be deleted, just unlinked.`)) return;
    try {
      await api.delete(`/programs/${p.id}`);
      toast.success('Program deleted');
      qc.invalidateQueries({ queryKey: ['programs'] });
    } catch { toast.error('Failed'); }
  };

  if (isLoading) return (
    <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
  );

  if (programs.length === 0) return (
    <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
      <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
      <p className="text-gray-500 font-medium">No programs yet</p>
      <p className="text-gray-400 text-sm mt-1">Create a program to group your courses</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {programs.map((program, idx) => {
        const color = PROGRAM_COLORS[program.color_token] ?? '#06b6d4';
        const isOpen = openPrograms.has(program.id);
        const totalStudents = program.studentCount ?? 0;

        return (
          <div key={program.id} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            {/* Program header — stacked on mobile so title/actions don't collide */}
            <div
              className="px-3 sm:px-5 py-3.5 sm:py-4"
              style={{ borderLeft: `4px solid ${color}` }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-white font-bold text-base sm:text-lg flex-shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {idx + 1}
                </div>

                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base sm:text-lg font-bold text-gray-900 break-words leading-snug">
                          {program.name}
                        </h2>
                        <span
                          className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                          style={{ backgroundColor: color + '20', color }}
                        >
                          Program
                        </span>
                      </div>
                      {program.description?.trim() ? (
                        <p className="text-sm text-gray-500 mt-1 leading-snug break-words">
                          {program.description}
                        </p>
                      ) : program.courses.length > 0 ? (
                        <p className="text-sm text-gray-500 mt-1 leading-snug break-words">
                          {program.courses.map((c) => c.title).join(' · ')}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-400 mt-1 italic">No courses added yet</p>
                      )}
                      <div className="flex items-center gap-3 sm:gap-4 mt-1.5 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3 h-3 flex-shrink-0" />
                          {program.courses.length} courses
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3 flex-shrink-0" />
                          {totalStudents} students
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleProgram(program.id)}
                      aria-label={isOpen ? 'Collapse program' : 'Expand program'}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                    >
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                      <button
                        type="button"
                        onClick={() => setAssigningTo(program)}
                        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors"
                      >
                        <Link2 className="w-3.5 h-3.5" /> Add Course
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditProgram(program)}
                        aria-label="Edit program"
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteProgram(program)}
                        aria-label="Delete program"
                        className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Courses grid */}
            {isOpen && (
              <div className="border-t border-gray-100 p-3 sm:p-4 bg-gray-50">
                {program.courses.length === 0 ? (
                  <div className="text-center py-8">
                    <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">No courses in this program yet</p>
                    {canEdit && (
                      <button type="button" onClick={() => setAssigningTo(program)}
                        className="mt-2 text-xs text-cyan-600 hover:text-cyan-800 font-medium">
                        + Add a course
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {program.courses.map(course => {
                      const cardBg = resolveCardBg(course.colorToken, course.category);
                      const tagStyle = resolveTagStyle(course.colorToken, course.category);
                      const progBar = resolveProgressColor(course.colorToken, course.category);
                      return (
                        <div key={course.id} className={`rounded-xl border shadow-sm hover:shadow-md transition-all ${cardBg} relative group`}>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => removeCourseFromProgram(program.id, course.id, course.title)}
                              className="absolute top-2 right-2 p-1.5 bg-white/90 text-gray-400 hover:text-rose-500 rounded-lg sm:opacity-0 sm:group-hover:opacity-100 transition-all shadow-sm z-10"
                              title="Remove from program">
                              <Unlink className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <div className="p-3.5 sm:p-4">
                            <div className="flex items-center gap-2 mb-2 flex-wrap pr-7 sm:pr-0">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tagStyle}`}>{course.category}</span>
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[course.status]}`}>
                                {course.status.charAt(0) + course.status.slice(1).toLowerCase()}
                              </span>
                            </div>
                            <h3 className="font-bold text-gray-900 text-sm leading-snug break-words mb-2">{course.title}</h3>
                            <div className="flex items-center gap-3 text-xs text-gray-500 mb-3 flex-wrap">
                              <span className="flex items-center gap-1"><Users className="w-3 h-3" />{course.studentCount ?? 0}</span>
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{course.durationMonths}m</span>
                              <span>{LEVEL_ICON[course.level]}</span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mb-3">
                              <div className={`h-full rounded-full ${progBar}`} style={{ width: `${course.completionPct ?? 0}%` }} />
                            </div>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => onManageCourse(course)}
                                className="flex-1 py-2 sm:py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg hover:opacity-90 flex items-center justify-center gap-1">
                                Manage <ChevronRight className="w-3 h-3" />
                              </button>
                              {canEdit && (
                                <button type="button" onClick={() => onEditCourse(course)}
                                  className="p-2 sm:p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {assigningTo && (
        <AssignCourseModal
          program={assigningTo}
          onClose={() => setAssigningTo(null)}
          onSuccess={() => { setAssigningTo(null); qc.invalidateQueries({ queryKey: ['programs'] }); }}
          onCreateNew={() => {
            onAddCourse(assigningTo.id);
            setAssigningTo(null);
          }}
        />
      )}
    </div>
  );
}

// ── Assign Course to Program Modal ────────────────────────────────────────────
function AssignCourseModal({ program, onClose, onSuccess, onCreateNew }: {
  program: Program; onClose: () => void; onSuccess: () => void; onCreateNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: allCourses = [] } = useQuery<Course[]>({
    queryKey: ['courses-unassigned'],
    queryFn: async () => {
      const { data } = await api.get('/courses', { params: { limit: 100 } });
      return data.data?.courses ?? data.data ?? [];
    },
  });

  // Filter out courses already in this program
  const assignedIds = new Set(program.courses.map(c => c.id));
  const available = allCourses.filter(c =>
    !c.programId &&
    c.status !== 'ARCHIVED' &&
    (c.title.toLowerCase().includes(search.toLowerCase()) || c.category.toLowerCase().includes(search.toLowerCase()))
  );

  async function assign(courseId: string, courseTitle: string) {
    setSaving(true);
    try {
      await api.post(`/programs/${program.id}/courses`, { course_id: courseId });
      toast.success(`"${courseTitle}" added to ${program.name}`);
      onSuccess();
    } catch { toast.error('Failed to assign'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Add Course to Program</h2>
            <p className="text-sm text-gray-500 mt-0.5">{program.name}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search courses..." autoFocus
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/30" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {available.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm mb-3">No unassigned courses available</p>
              <button onClick={onCreateNew}
                className="px-4 py-2 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 rounded-lg text-sm font-semibold transition-colors">
                + Create New Course
              </button>
            </div>
          ) : (
            <>
              {available.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-cyan-200 hover:bg-cyan-50/30 transition-all">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{c.title}</p>
                    <p className="text-xs text-gray-400">{c.category} · {c.durationMonths} months</p>
                  </div>
                  <button onClick={() => assign(c.id, c.title)} disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg hover:opacity-90 disabled:opacity-50">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              ))}
              <div className="pt-4 mt-2 border-t text-center">
                <button onClick={onCreateNew}
                  className="text-sm font-medium text-cyan-600 hover:text-cyan-700">
                  + Or Create New Course
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Program Create/Edit Modal ─────────────────────────────────────────────────
function ProgramModal({ program, onClose, onSuccess }: {
  program: Program | null; onClose: () => void; onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: program?.name ?? '',
    description: program?.description ?? '',
    color_token: program?.color_token ?? 'cyan',
    sort_order: String(program?.sort_order ?? 0),
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.name.trim()) { toast.error('Program name is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, sort_order: parseInt(form.sort_order) || 0 };
      if (program) await api.put(`/programs/${program.id}`, payload);
      else await api.post('/programs', payload);
      toast.success(program ? 'Program updated' : 'Program created');
      onSuccess();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold text-gray-900">{program ? 'Edit Program' : 'Create Program'}</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Program Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Data Analytics, Fullstack Development" className={inputCls} autoFocus />
            <p className="text-xs text-gray-400 mt-1">Courses will be added after creating the program</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Color</label>
              <div className="flex gap-2 flex-wrap p-2 bg-gray-50 rounded-xl border border-gray-100">
                {(['cyan', 'purple', 'amber', 'emerald', 'rose', 'indigo', 'sky', 'orange'] as const).map(c => (
                  <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color_token: c }))}
                    className={`w-7 h-7 rounded-full transition-all ${form.color_token === c ? 'ring-2 ring-offset-1 ring-gray-700 scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: PROGRAM_COLORS[c] }} />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Display Order</label>
              <input type="number" min={0} value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} className={inputCls} />
            </div>
          </div>
        </div>
        <div className="p-6 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {program ? 'Save Changes' : 'Create Program'}
          </button>
        </div>
      </div>
    </div>
  );
}
