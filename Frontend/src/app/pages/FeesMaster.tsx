import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Search, ChevronDown, ChevronRight, X, Loader2, Bell,
  CheckCircle2, Clock, Phone, User, Calendar, Trash2,
  Save, IndianRupee, Users, BookOpen, Building2, Upload,
  Briefcase, DollarSign
} from 'lucide-react';
import api from '../../lib/axios';
import { useAuth } from '../../store/AuthContext';
import { InternApprovalModal } from './fees-master/InternApprovalModal';

// Types
interface MonthOption { month: string; label: string; }
interface StudentRow {
  account_status?: string;
  student_id: string; name: string; email: string; phone_number?: string;
  fee_id?: string; fees_offered?: number; due_amount?: number;
  total_paid?: number; enrolled_month?: string;
}
interface BatchRow {
  batch_id: string; batch_name: string; batch_status: string;
  students: StudentRow[];
}
interface CourseRow {
  course_id: string; course_title: string; color_token: string;
  batches: BatchRow[];
}
interface StudentFeeRow extends StudentRow {
  id: string; name: string; email: string; phone_number?: string;
  fee_id?: string; fees_offered?: number; due_amount?: number;
}

const COLOR_MAP: Record<string, string> = {
  cyan: '#06b6d4', purple: '#8b5cf6', indigo: '#6366f1',
  amber: '#f59e0b', sky: '#0ea5e9', rose: '#f43f5e',
  emerald: '#10b981', teal: '#14b8a6', orange: '#f97316',
  gray: '#6b7280',
};

const fmt = (n?: number | null) =>
  n != null ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n) : '--';

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--';

const BATCH_STATUS_CLR: Record<string, string> = {
  ONGOING: 'bg-emerald-100 text-emerald-700',
  UPCOMING: 'bg-cyan-100 text-cyan-700',
  COMPLETED: 'bg-gray-100 text-gray-500',
};

// Main Page
export default function FeesMasterPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<'months' | 'all'>('months');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentFeeRow | null>(null);
  const [assignCoursesStudent, setAssignCoursesStudent] = useState<any | null>(null);
  const [openCourses, setOpenCourses] = useState<Set<string>>(new Set());
  const [openBatches, setOpenBatches] = useState<Set<string>>(new Set());
  const [showUpiSettings, setShowUpiSettings] = useState(false);

  const canManageCourses = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'FEES_ADMIN';

  const { data: months = [] } = useQuery<MonthOption[]>({
    queryKey: ['fee-months'],
    queryFn: async () => { const { data } = await api.get('/fees-v2/months'); return data.data ?? []; },
  });

  const { data: tree = [], isLoading } = useQuery<CourseRow[]>({
    queryKey: ['fee-tree', selectedMonth],
    queryFn: async () => {
      const params: any = {};
      if (selectedMonth) params.month = selectedMonth;
      const { data } = await api.get('/fees-v2/tree', { params });
      return data.data ?? [];
    },
  });

  const { data: allStudentsData = { items: [], total: 0, limit: 50 }, isLoading: loadingAllStudents } = useQuery<any>({
    queryKey: ['fees-all-students', search, page],
    queryFn: async () => {
      const params: any = { page, limit: 50 };
      if (search) params.search = search;
      const { data } = await api.get('/fees-v2/students', { params });
      return data.data && data.data.items ? data.data : { items: Array.isArray(data.data) ? data.data : [], total: 0, limit: 50 };
    },
    enabled: viewMode === 'all',
  });

  const allStudents = allStudentsData.items || [];
  const totalStudentsCount = allStudentsData.total || 0;
  const totalPages = Math.ceil(totalStudentsCount / (allStudentsData.limit || 50));

  function toggleCourse(id: string) {
    setOpenCourses(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function toggleBatch(id: string) {
    setOpenBatches(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function deleteFeeRecord(feeId: string, name: string) {
    if (!confirm(`Delete fee record for ${name}?`)) return;
    api.delete(`/fees-v2/records/${feeId}`)
      .then(() => {
        toast.success('Deleted');
        qc.invalidateQueries({ queryKey: ['fee-tree'] });
        qc.invalidateQueries({ queryKey: ['fees-all-students'] });
      })
      .catch(() => toast.error('Delete failed'));
  }

  function toggleBlockStudent(studentId: string, name: string, currentStatus: string | undefined) {
    const action = currentStatus === 'BLOCKED' ? 'unblock' : 'block';
    if (!confirm(`Are you sure you want to ${action} portal access for ${name}?`)) return;
    api.post(`/fees-v2/students/${studentId}/block`)
      .then((res) => {
        const nextStatus = res.data?.data?.status;
        toast.success(`${name} has been ${nextStatus === 'BLOCKED' ? 'blocked' : 'unblocked'} successfully.`);
        qc.invalidateQueries({ queryKey: ['fee-tree'] });
        qc.invalidateQueries({ queryKey: ['fees-all-students'] });
      })
      .catch(() => toast.error('Action failed'));
  }

  // Local filtering in Month Tree view
  const filteredTree = tree.map(course => {
    const batches = course.batches.map(batch => {
      const students = batch.students.filter(s => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.phone_number && s.phone_number.includes(q))
        );
      });
      return { ...batch, students };
    }).filter(b => b.students.length > 0);
    return { ...course, batches };
  }).filter(c => c.batches.length > 0);

  const totalStudents = filteredTree.reduce((a, c) => a + c.batches.reduce((b, bt) => b + bt.students.length, 0), 0);
  const totalWithFees = filteredTree.reduce((a, c) => a + c.batches.reduce((b, bt) => b + bt.students.filter(s => s.fee_id).length, 0), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <IndianRupee className="w-6 h-6 text-cyan-600" /> Fees Module
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {totalStudents} students &nbsp;·&nbsp; {totalWithFees} with fee records
          </p>
        </div>
        <button onClick={() => setShowUpiSettings(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm">
          UPI Settings
        </button>
      </div>

      {/* Unified Search and View Mode Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1 shrink-0">
          <button onClick={() => setViewMode('months')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${viewMode === 'months' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
            Month-wise Enrolled List
          </button>
          <button onClick={() => setViewMode('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${viewMode === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
            All Students Directory
          </button>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search students by name or mobile number..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-400 transition-all shadow-sm"
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Pending student approvals */}
      <PendingSignupsPanel />

      {/* Active students without program — incomplete admin-registered setups */}
      <UnassignedStudentsPanel />

      {/* Pending payment verifications */}
      <PendingProofsPanel />

      {/* Mode 1: Month-wise Enrollments */}
      {viewMode === 'months' && (
        <>
          {/* Month tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setSelectedMonth('')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${!selectedMonth ? 'bg-cyan-500 text-white border-cyan-500 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-cyan-300'
                }`}>
              All Months
            </button>
            {months.map(m => (
              <button key={m.month} onClick={() => setSelectedMonth(m.month)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${selectedMonth === m.month ? 'bg-cyan-500 text-white border-cyan-500 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-cyan-300'
                  }`}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Course > Batch > Student accordion */}
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
          ) : filteredTree.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No students found matching your search</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTree.map(course => {
                const color = COLOR_MAP[course.color_token] ?? '#06b6d4';
                const isOpen = openCourses.has(course.course_id);
                const totalInCourse = course.batches.reduce((a, b) => a + b.students.length, 0);
                const feeCount = course.batches.reduce((a, b) => a + b.students.filter(s => s.fee_id).length, 0);

                return (
                  <div key={course.course_id} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                    {/* Course header */}
                    <button onClick={() => toggleCourse(course.course_id)}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: color + '20', border: `1.5px solid ${color}40` }}>
                        <BookOpen className="w-5 h-5" style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900">{course.course_title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {course.batches.length} batch{course.batches.length !== 1 ? 'es' : ''} &nbsp;·&nbsp;
                          {totalInCourse} students &nbsp;·&nbsp;
                          <span className={feeCount > 0 ? 'text-emerald-600' : 'text-gray-400'}>
                            {feeCount} fee records
                          </span>
                        </p>
                      </div>
                      {isOpen
                        ? <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        : <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />}
                    </button>

                    {/* Batches */}
                    {isOpen && (
                      <div className="border-t border-gray-100">
                        {course.batches.map(batch => {
                          const batchOpen = openBatches.has(batch.batch_id);
                          const batchFeeCount = batch.students.filter(s => s.fee_id).length;

                          return (
                            <div key={batch.batch_id} className="border-b border-gray-50 last:border-0">
                              {/* Batch header */}
                              <button onClick={() => toggleBatch(batch.batch_id)}
                                className="w-full flex items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors text-left">
                                <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold text-gray-800 text-sm">{batch.batch_name}</p>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BATCH_STATUS_CLR[batch.batch_status] ?? 'bg-gray-100 text-gray-500'}`}>
                                      {batch.batch_status}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {batch.students.length} students &nbsp;·&nbsp;
                                    <span className={batchFeeCount > 0 ? 'text-emerald-600' : 'text-gray-400'}>
                                      {batchFeeCount} fee records
                                    </span>
                                  </p>
                                </div>
                                {batchOpen
                                  ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                  : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                              </button>

                              {/* Students */}
                              {batchOpen && (
                                <div className="bg-gray-50 border-t border-gray-100">
                                  {batch.students.map(s => {
                                    const due = s.due_amount ?? 0;
                                    return (
                                      <div key={s.student_id}
                                        className="flex flex-col gap-3 px-4 sm:px-8 py-3.5 border-b border-gray-100 last:border-0 hover:bg-white transition-colors group sm:flex-row sm:items-center sm:gap-3">
                                        <div className="flex items-start gap-3 min-w-0 flex-1">
                                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                            style={{ backgroundColor: color + '20', color }}>
                                            {s.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-gray-900 flex flex-wrap items-center gap-2">
                                              <span className="truncate">{s.name}</span>
                                              {s.account_status === 'BLOCKED' && (
                                                <span className="px-1.5 py-0.5 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-md">Blocked</span>
                                              )}
                                            </p>
                                            <p className="text-xs text-gray-400 truncate mt-0.5">{s.email}</p>
                                            {s.phone_number && (
                                              <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                                <Phone className="w-3 h-3 shrink-0" />{s.phone_number}
                                              </p>
                                            )}
                                          </div>
                                        </div>

                                        <div className="flex flex-col gap-2 pl-12 sm:pl-0 sm:items-end sm:flex-shrink-0">
                                          <div className="flex items-center gap-4">
                                            {s.fee_id ? (
                                              <>
                                                <div>
                                                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Offered</p>
                                                  <p className="text-sm font-semibold text-gray-900">{fmt(s.fees_offered)}</p>
                                                </div>
                                                <div>
                                                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Due</p>
                                                  <p className={`text-sm font-bold ${due > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                    {due > 0 ? fmt(due) : 'Paid'}
                                                  </p>
                                                </div>
                                              </>
                                            ) : (
                                              <span className="text-xs text-gray-400 italic">No fee record</span>
                                            )}
                                          </div>
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <button
                                              onClick={() => toggleBlockStudent(s.student_id, s.name, s.account_status)}
                                              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${s.account_status === 'BLOCKED'
                                                ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                                                : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                                }`}>
                                              {s.account_status === 'BLOCKED' ? 'Unblock' : 'Block'}
                                            </button>
                                            {canManageCourses && (
                                              <button
                                                onClick={() => setAssignCoursesStudent({ ...s, id: s.student_id })}
                                                className="px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors">
                                                Courses
                                              </button>
                                            )}
                                            <button
                                              onClick={() => setSelectedStudent({ ...s, id: s.student_id })}
                                              className="px-2.5 py-1.5 text-xs font-semibold text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors">
                                              {s.fee_id ? 'Edit' : 'Add Fee'}
                                            </button>
                                            {s.fee_id && (
                                              <button
                                                onClick={async () => {
                                                  try {
                                                    const { data } = await api.post(`/invoices/generate/${s.student_id}`);
                                                    window.open(`/invoice/${data.data.id}`, '_blank');
                                                  } catch (err: any) {
                                                    toast.error(err.response?.data?.message || 'Failed to generate invoice');
                                                  }
                                                }}
                                                className="px-2.5 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                                              >
                                                Invoice
                                              </button>
                                            )}
                                            {s.fee_id && (
                                              <button
                                                onClick={() => deleteFeeRecord(s.fee_id!, s.name)}
                                                className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors sm:opacity-0 sm:group-hover:opacity-100">
                                                <Trash2 className="w-3.5 h-3.5" />
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
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Mode 2: All Students Directory */}
      {viewMode === 'all' && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          {loadingAllStudents ? (
            <div className="p-8 text-center text-gray-500 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
              Loading student directory...
            </div>
          ) : allStudents.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No students registered yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-4">Student ID</th>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Phone Number</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4 text-right">Fees Offered</th>
                    <th className="px-6 py-4 text-right">Due Amount</th>
                    <th className="px-6 py-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm text-gray-700">
                  {allStudents.map((s: StudentRow & { id?: string }) => {
                    const studentId = s.id || s.student_id;
                    const due = s.due_amount ?? 0;
                    return (
                      <tr key={studentId} className="hover:bg-gray-50/80 transition-colors group">
                        <td className="px-6 py-4 font-mono text-xs text-gray-400">{studentId ? studentId.slice(0, 8) : '--'}...</td>
                        <td className="px-6 py-4 font-semibold text-gray-900">
                          <span className="inline-flex items-center gap-2">
                            {s.name}
                            {s.account_status === 'BLOCKED' && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-md">Blocked</span>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500">{s.phone_number ?? '--'}</td>
                        <td className="px-6 py-4 text-gray-500">{s.email}</td>
                        <td className="px-6 py-4 text-right font-medium">{s.fee_id ? fmt(s.fees_offered) : '--'}</td>
                        <td className="px-6 py-4 text-right">
                          {s.fee_id ? (
                            <span className={`font-bold ${due > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {due > 0 ? fmt(due) : 'Paid'}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 italic">No record</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <button
                              onClick={() => toggleBlockStudent(studentId, s.name, s.account_status)}
                              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${s.account_status === 'BLOCKED'
                                ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                                : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                }`}>
                              {s.account_status === 'BLOCKED' ? 'Unblock' : 'Block'}
                            </button>
                            {canManageCourses && (
                              <button
                                onClick={() => setAssignCoursesStudent({ ...s, id: studentId, student_id: studentId })}
                                className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors">
                                Courses
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedStudent({ ...s, id: studentId, student_id: studentId })}
                              className="px-3 py-1.5 text-xs font-semibold text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors">
                              {s.fee_id ? 'Edit' : 'Add Fee'}
                            </button>
                            {s.fee_id && (
                              <button
                                onClick={() => deleteFeeRecord(s.fee_id!, s.name)}
                                className="p-1.5 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-gray-100">
                {allStudents.map((s: StudentRow & { id?: string }) => {
                  const studentId = s.id || s.student_id;
                  const due = s.due_amount ?? 0;
                  return (
                    <div key={studentId} className="p-4 space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 flex flex-wrap items-center gap-2">
                          {s.name}
                          {s.account_status === 'BLOCKED' && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-md">Blocked</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 break-all">{s.email}</p>
                        {s.phone_number && <p className="text-xs text-gray-400 mt-0.5">{s.phone_number}</p>}
                      </div>
                      <div className="flex gap-6">
                        <div>
                          <p className="text-[10px] uppercase text-gray-400">Offered</p>
                          <p className="text-sm font-semibold">{s.fee_id ? fmt(s.fees_offered) : '--'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-gray-400">Due</p>
                          <p className={`text-sm font-bold ${s.fee_id && due > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {s.fee_id ? (due > 0 ? fmt(due) : 'Paid') : '—'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => toggleBlockStudent(studentId, s.name, s.account_status)}
                          className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border ${s.account_status === 'BLOCKED'
                            ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : 'bg-gray-50 border-gray-200 text-gray-700'
                            }`}>
                          {s.account_status === 'BLOCKED' ? 'Unblock' : 'Block'}
                        </button>
                        {canManageCourses && (
                          <button
                            onClick={() => setAssignCoursesStudent({ ...s, id: studentId, student_id: studentId })}
                            className="px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg">
                            Courses
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedStudent({ ...s, id: studentId, student_id: studentId })}
                          className="px-2.5 py-1.5 text-xs font-semibold text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg">
                          {s.fee_id ? 'Edit' : 'Add Fee'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalPages > 1 && (
                <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                  <span className="text-sm text-gray-500">
                    Showing {(page - 1) * (allStudentsData.limit || 50) + 1}–{Math.min(page * (allStudentsData.limit || 50), totalStudentsCount)} of {totalStudentsCount} students
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      className="px-3 py-1 text-sm border bg-white rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      className="px-3 py-1 text-sm border bg-white rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Fee detail drawer */}
      {selectedStudent && (
        <FeeDetailDrawer
          student={selectedStudent}
          selectedMonth={selectedMonth}
          onClose={() => setSelectedStudent(null)}
        />
      )}

      {/* Assign Courses Modal */}
      {assignCoursesStudent && (
        <AssignCoursesModal
          student={assignCoursesStudent}
          onClose={() => setAssignCoursesStudent(null)}
          onSuccess={() => setAssignCoursesStudent(null)}
        />
      )}

      {/* UPI Settings Modal */}
      {showUpiSettings && <UpiSettingsModal onClose={() => setShowUpiSettings(false)} />}
    </div>
  );
}

// Fee Detail Drawer
function FeeDetailDrawer({ student, selectedMonth, onClose }: {
  student: StudentFeeRow; selectedMonth: string; onClose: () => void;
}) {
  const qc = useQueryClient();

  const { data: feeData, isLoading } = useQuery<any>({
    queryKey: ['student-fee', student.student_id],
    queryFn: async () => {
      const { data } = await api.get(`/fees-v2/students/${student.student_id}`);
      return data.data ?? {};
    },
  });

  const fee = feeData && Object.keys(feeData).length > 0 ? feeData : student;

  const defaultForm = () => ({
    enrolled_month: fee.enrolled_month?.slice(0, 7) ?? selectedMonth ?? new Date().toISOString().slice(0, 7),
    fees_offered: String(fee.fees_offered ?? ''),
    registration_expected: String((fee as any).registration_expected ?? ''),
    registration_amount: String(fee.registration_amount ?? ''),
    registration_date: fee.registration_date?.slice(0, 10) ?? '',
    registration_reminder_status: fee.registration_reminder_status ?? '',
    registration_reminder_date: fee.registration_reminder_date?.slice(0, 10) ?? '',
    installment1_expected: String((fee as any).installment1_expected ?? ''),
    installment1_amount: String(fee.installment1_amount ?? ''),
    installment1_date: fee.installment1_date?.slice(0, 10) ?? '',
    installment1_reminder_status: fee.installment1_reminder_status ?? '',
    installment1_reminder_date: fee.installment1_reminder_date?.slice(0, 10) ?? '',
    installment2_expected: String((fee as any).installment2_expected ?? ''),
    installment2_amount: String(fee.installment2_amount ?? ''),
    installment2_date: fee.installment2_date?.slice(0, 10) ?? '',
    installment2_reminder_status: fee.installment2_reminder_status ?? '',
    installment2_reminder_date: fee.installment2_reminder_date?.slice(0, 10) ?? '',
    installment3_expected: String((fee as any).installment3_expected ?? ''),
    installment3_amount: String(fee.installment3_amount ?? ''),
    installment3_date: fee.installment3_date?.slice(0, 10) ?? '',
    installment3_reminder_status: fee.installment3_reminder_status ?? '',
    installment3_reminder_date: fee.installment3_reminder_date?.slice(0, 10) ?? '',
    remarks: fee.remarks ?? '',
  });

  const [form, setForm] = useState(defaultForm);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    setForm(defaultForm());
  }, [feeData]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        fee_id: fee.fee_id ?? undefined,
        student_id: student.student_id,
        enrolled_month: form.enrolled_month,
        fees_offered: form.fees_offered ? parseFloat(form.fees_offered) : 0,
        remarks: form.remarks || null,
      };
      const numFields = ['registration_expected', 'registration_amount',
        'installment1_expected', 'installment1_amount',
        'installment2_expected', 'installment2_amount',
        'installment3_expected', 'installment3_amount'];
      const strFields = ['registration_date', 'registration_reminder_status', 'registration_reminder_date',
        'installment1_date', 'installment1_reminder_status', 'installment1_reminder_date',
        'installment2_date', 'installment2_reminder_status', 'installment2_reminder_date',
        'installment3_date', 'installment3_reminder_status', 'installment3_reminder_date'];
      numFields.forEach(f => { if ((form as any)[f]) payload[f] = parseFloat((form as any)[f]); });
      strFields.forEach(f => { if ((form as any)[f]) payload[f] = (form as any)[f]; });
      await api.post(`/fees-v2/students/${student.student_id}`, payload);
    },
    onSuccess: () => {
      toast.success('Fee record saved');
      qc.invalidateQueries({ queryKey: ['fee-tree'] });
      qc.invalidateQueries({ queryKey: ['student-fee', student.student_id] });
      qc.invalidateQueries({ queryKey: ['fees-all-students'] });
    },
    onError: () => toast.error('Failed to save'),
  });

  const reminderMutation = useMutation({
    mutationFn: async (field: string) => {
      if (!fee.fee_id) { toast.error('Save the fee record first'); return; }
      await api.post(`/fees-v2/reminders/${fee.fee_id}`, { field });
    },
    onSuccess: () => { toast.success('Reminder sent'); qc.invalidateQueries({ queryKey: ['student-fee', student.student_id] }); },
    onError: () => toast.error('Failed'),
  });

  const f = (key: string) => (form as any)[key];
  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const getAutoReminders = (dueDateStr: string) => {
    if (!dueDateStr) return null;
    const dueDate = new Date(dueDateStr);
    if (isNaN(dueDate.getTime())) return null;

    const r7 = new Date(dueDate);
    r7.setDate(r7.getDate() - 7);

    const r3 = new Date(dueDate);
    r3.setDate(r3.getDate() - 3);

    const r1 = new Date(dueDate);
    r1.setDate(r1.getDate() - 1);

    const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return {
      r7: fmtDate(r7),
      r3: fmtDate(r3),
      r1: fmtDate(r1)
    };
  };

  const inputCls = 'w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-cyan-400';
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1';

  const offered = parseFloat(form.fees_offered) || 0;
  const regExp = parseFloat(form.registration_expected) || 0;
  const inst1Exp = parseFloat(form.installment1_expected) || 0;
  const inst2Exp = parseFloat(form.installment2_expected) || 0;
  const inst3Exp = parseFloat(form.installment3_expected) || 0;
  const regAmt = parseFloat(form.registration_amount) || 0;
  const inst1Amt = parseFloat(form.installment1_amount) || 0;
  const inst2Amt = parseFloat(form.installment2_amount) || 0;
  const inst3Amt = parseFloat(form.installment3_amount) || 0;
  const totalPaid = regAmt + inst1Amt + inst2Amt + inst3Amt;
  const balance = offered - totalPaid;

  const regToBePaid = Math.max(0, regExp - regAmt);
  const inst1ToBePaid = Math.max(0, inst1Exp - inst1Amt);
  const inst2ToBePaid = Math.max(0, inst2Exp - inst2Amt);
  const inst3ToBePaid = Math.max(0, inst3Exp - inst3Amt);

  const tableRows = [
    { label: 'Registration', expKey: 'registration_expected', amtKey: 'registration_amount', dateKey: 'registration_date', rsKey: 'registration_reminder_status', rdKey: 'registration_reminder_date', reminderField: 'registration_reminder', toBePaid: regToBePaid },
    { label: '1st Installment', expKey: 'installment1_expected', amtKey: 'installment1_amount', dateKey: 'installment1_date', rsKey: 'installment1_reminder_status', rdKey: 'installment1_reminder_date', reminderField: 'installment1_reminder', toBePaid: inst1ToBePaid },
    { label: '2nd Installment', expKey: 'installment2_expected', amtKey: 'installment2_amount', dateKey: 'installment2_date', rsKey: 'installment2_reminder_status', rdKey: 'installment2_reminder_date', reminderField: 'installment2_reminder', toBePaid: inst2ToBePaid },
    { label: '3rd Installment', expKey: 'installment3_expected', amtKey: 'installment3_amount', dateKey: 'installment3_date', rsKey: 'installment3_reminder_status', rdKey: 'installment3_reminder_date', reminderField: 'installment3_reminder', toBePaid: inst3ToBePaid },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-6xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in fade-in duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-700 font-bold text-sm">
              {student.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-gray-900">{student.name}</p>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span>{student.email}</span>
                {student.phone_number && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{student.phone_number}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl hover:opacity-90 disabled:opacity-60 shadow-sm">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
            {fee.fee_id && (
              <button onClick={() => {
                if (confirm('Delete this fee record?')) {
                  api.delete(`/fees-v2/records/${fee.fee_id}`)
                    .then(() => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['fee-tree'] }); qc.invalidateQueries({ queryKey: ['fees-all-students'] }); onClose(); })
                    .catch(() => toast.error('Delete failed'));
                }
              }} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )}
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Balance bar */}
        <div className="flex items-center gap-6 px-6 py-3 bg-white border-b flex-shrink-0 flex-wrap">
          <div className="text-center">
            <p className="text-xs text-gray-400">Fees Offered</p>
            <p className="text-base font-bold text-gray-900">{fmt(offered || undefined)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">Total Paid</p>
            <p className="text-base font-bold text-emerald-600">{fmt(totalPaid || undefined)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">Balance</p>
            <p className={`text-base font-bold ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {balance > 0 ? fmt(balance) : 'Paid'}
            </p>
          </div>
          <div className="ml-auto">
            <label className={labelCls}>Enrolled Month</label>
            <input type="month" value={f('enrolled_month')} onChange={e => set('enrolled_month', e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : (
            <>
              {/* Fees Offered */}
              <div className="bg-cyan-50 border border-cyan-100 rounded-2xl p-4">
                <label className="block text-sm font-semibold text-cyan-800 mb-2">Fees Offered</label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-sm">Rs.</span>
                  <input type="number" value={f('fees_offered')} onChange={e => set('fees_offered', e.target.value)}
                    placeholder="0" className={inputCls + ' max-w-xs'} />
                </div>
              </div>

              {/* Milestone Grid (2 Columns, spacious card layout) */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {tableRows.map(row => {
                  const hasExp = parseFloat(f(row.expKey)) > 0;
                  const isPaid = hasExp && row.toBePaid === 0;
                  const reminders = getAutoReminders(f(row.dateKey));
                  return (
                    <div key={row.label} className={`border rounded-2xl p-5 shadow-sm transition-all bg-white relative overflow-hidden flex flex-col justify-between ${isPaid ? 'border-emerald-250 bg-emerald-500/5' : 'border-gray-200'
                      }`}>
                      {/* Top banner / icon */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-cyan-100 text-cyan-700'
                            }`}>
                            <IndianRupee className="w-4 h-4" />
                          </div>
                          <span className="font-bold text-gray-800 text-sm">{row.label} Milestone</span>
                        </div>
                        {isPaid ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-100/60 px-2 py-0.5 rounded-full uppercase">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Fully Paid
                          </span>
                        ) : hasExp ? (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full uppercase">
                            Pending {fmt(row.toBePaid)}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full uppercase">
                            Not Configured
                          </span>
                        )}
                      </div>

                      {/* Inputs Grid */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-500 mb-1">Expected Amount (INR)</label>
                          <input
                            type="number"
                            value={f(row.expKey)}
                            onChange={e => set(row.expKey, e.target.value)}
                            placeholder="Expected Amount"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-500 mb-1">Paid Amount (INR)</label>
                          <input
                            type="number"
                            value={f(row.amtKey)}
                            onChange={e => set(row.amtKey, e.target.value)}
                            placeholder="Paid Amount"
                            className={inputCls}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className={`block text-[10px] font-semibold mb-1 ${isPaid ? 'text-emerald-600 font-bold animate-in fade-in duration-200' : 'text-gray-500'}`}>
                            {isPaid ? 'Paid Date' : 'Due Date / Last Date *'}
                          </label>
                          <input
                            type="date"
                            value={f(row.dateKey)}
                            onChange={e => {
                              const newDate = e.target.value;
                              setForm(prev => {
                                const next = { ...prev, [row.dateKey]: newDate };
                                const nextAny = next as Record<string, any>;
                                if (newDate) {
                                  const d = new Date(newDate);
                                  if (!isNaN(d.getTime())) {
                                    d.setDate(d.getDate() - 7);
                                    const yyyy = d.getFullYear();
                                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                                    const dd = String(d.getDate()).padStart(2, '0');
                                    nextAny[row.rdKey] = `${yyyy}-${mm}-${dd}`;
                                    if (!nextAny[row.rsKey]) {
                                      nextAny[row.rsKey] = 'PENDING';
                                    }
                                  }
                                }
                                return next;
                              });
                            }}
                            className={inputCls}
                          />
                        </div>
                      </div>

                      {/* Automatic Reminders Widget */}
                      {f(row.dateKey) && !isPaid && reminders && (
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                          <p className="text-[10px] font-bold text-amber-800 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>⏰ Scheduled Auto-Reminders</span>
                          </p>
                          <div className="grid grid-cols-3 gap-1.5 text-[9px] font-semibold text-amber-700">
                            <div className="bg-white/80 border border-amber-100/60 p-1.5 rounded-lg text-center">
                              <p className="text-gray-400">1st (7 Days Prior)</p>
                              <p className="font-bold text-gray-700 mt-0.5">{reminders.r7}</p>
                            </div>
                            <div className="bg-white/80 border border-amber-100/60 p-1.5 rounded-lg text-center">
                              <p className="text-gray-400">2nd (3 Days Prior)</p>
                              <p className="font-bold text-gray-700 mt-0.5">{reminders.r3}</p>
                            </div>
                            <div className="bg-white/80 border border-amber-100/60 p-1.5 rounded-lg text-center">
                              <p className="text-gray-400">3rd (1 Day Prior)</p>
                              <p className="font-bold text-gray-700 mt-0.5">{reminders.r1}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Manual Override controls */}
                      {!isPaid && (
                        <div className="border-t border-gray-100 pt-3 flex items-center justify-between gap-3 mt-auto">
                          <div className="flex-1">
                            <label className="block text-[9px] font-semibold text-gray-400 mb-0.5">Manual Reminder Status</label>
                            <select value={f(row.rsKey)} onChange={e => set(row.rsKey, e.target.value)} className="w-full px-2 py-1 text-[11px] border border-gray-200 rounded-lg bg-gray-50 focus:outline-none">
                              <option value="">-- Status --</option>
                              <option value="PENDING">Pending</option>
                              <option value="SENT">Sent</option>
                              <option value="ACKNOWLEDGED">Acknowledged</option>
                            </select>
                          </div>
                          <div className="flex-1">
                            <label className="block text-[9px] font-semibold text-gray-400 mb-0.5">Manual Reminder Date</label>
                            <input type="date" value={f(row.rdKey)} onChange={e => set(row.rdKey, e.target.value)} className="w-full px-2 py-1 text-[11px] border border-gray-200 rounded-lg bg-gray-50 focus:outline-none" />
                          </div>
                          <button
                            type="button"
                            onClick={() => reminderMutation.mutate(row.reminderField)}
                            disabled={reminderMutation.isPending}
                            className="p-2 text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all self-end shrink-0"
                            title="Send instant WhatsApp/Email alert"
                          >
                            <Bell className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Remarks */}
              <div>
                <label className={labelCls}>Remarks</label>
                <textarea value={f('remarks')} onChange={e => set('remarks', e.target.value)}
                  rows={3} placeholder="Notes about this student's fees..."
                  className={inputCls + ' resize-none'} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Pending Signups Approval Panel
function PendingSignupsPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [approvingStudent, setApprovingStudent] = useState<any | null>(null);
  const [approvingIntern, setApprovingIntern] = useState<any | null>(null);

  const { data: signups = [], isLoading } = useQuery<any[]>({
    queryKey: ['pending-signups'],
    queryFn: async () => {
      const { data } = await api.get('/fees-v2/signups/pending');
      return data.data ?? [];
    },
    staleTime: 15_000,
    refetchInterval: open ? 30_000 : false,
    refetchIntervalInBackground: false,
  });

  async function handleReject(studentId: string, name: string) {
    if (!confirm(`Are you sure you want to reject and delete the application of ${name}?`)) return;
    try {
      await api.post(`/fees-v2/signups/${studentId}/reject`);
      await api.delete(`/fees-v2/signups/${studentId}`);
      toast.success('Registration rejected and cleared.');
      qc.invalidateQueries({ queryKey: ['pending-signups'] });
      qc.invalidateQueries({ queryKey: ['fee-tree'] });
      qc.invalidateQueries({ queryKey: ['fees-all-students'] });
    } catch {
      toast.error('Failed to reject registration.');
    }
  }

  async function handlePortalSwitch(userId: string, portal: 'STUDENT' | 'INTERN', name: string) {
    const label = portal === 'INTERN' ? 'Intern Portal' : 'Student Portal';
    if (!confirm(`Map ${name} to ${label}?`)) return;
    try {
      await api.patch(`/fees-v2/signups/${userId}/portal`, { portal });
      toast.success(`Mapped to ${label}`);
      qc.invalidateQueries({ queryKey: ['pending-signups'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to update portal mapping');
    }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden mb-5">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${signups.length > 0 ? 'bg-cyan-100' : 'bg-gray-100'}`}>
            <Users className={`w-4 h-4 ${signups.length > 0 ? 'text-cyan-600' : 'text-gray-400'}`} />
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-900 text-sm">Pending Student Registrations</p>
            <p className="text-xs text-gray-400">
              {signups.length > 0 ? `${signups.length} student signup${signups.length !== 1 ? 's' : ''} to review` : 'No pending registrations'}
            </p>
          </div>
          {signups.length > 0 && (
            <span className="bg-cyan-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{signups.length}</span>
          )}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1, 2].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : signups.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">No pending registrations</div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
              {signups.map(s => (
                <div key={s.id} className="p-5 flex flex-col md:flex-row md:items-start gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 text-base">{s.name}</span>
                      {s.role === 'INTERN' ? (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-0.5 rounded-full font-medium">Intern</span>
                      ) : (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-medium">Student</span>
                      )}
                      <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full font-medium font-mono">Pending Approval</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-4 text-xs text-gray-500">
                      <p className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-gray-400" /> {s.email}</p>
                      <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-gray-400" /> {s.phone_number || '--'}</p>
                      <p className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-gray-400" /> DOB: {s.date_of_birth ? fmtDate(s.date_of_birth) : '--'}</p>
                      <p className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-gray-400" /> {s.qualification || '--'} ({s.graduation_year || '--'})</p>
                      <p className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-gray-400" /> Pref: {s.class_preference || '--'}</p>
                      <p className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-gray-400" /> Source: {s.lead_source || '--'}</p>
                    </div>

                    {s.address && (
                      <p className="text-xs text-gray-400 bg-gray-50 p-2 rounded-lg mt-1 border border-gray-100">
                        <strong>Address:</strong> {s.address}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-start flex-shrink-0 flex-wrap justify-end">
                    {s.role === 'INTERN' ? (
                      <>
                        <button onClick={() => setApprovingIntern(s)}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-purple-500 to-fuchsia-500 rounded-xl shadow-md shadow-purple-500/20 hover:opacity-95 transition-all">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Accept Intern
                        </button>
                        <button onClick={() => handlePortalSwitch(s.id, 'STUDENT', s.name)}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors">
                          Map to Student Portal
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setApprovingStudent(s)}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl shadow-md shadow-cyan-500/20 hover:opacity-95 transition-all">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Accept Student
                        </button>
                        <button onClick={() => handlePortalSwitch(s.id, 'INTERN', s.name)}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-xl hover:bg-purple-100 transition-colors">
                          Map to Intern Portal
                        </button>
                      </>
                    )}
                    <button onClick={() => handleReject(s.id, s.name)}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-colors">
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {approvingStudent && (
        <StudentApprovalModal
          student={approvingStudent}
          onClose={() => setApprovingStudent(null)}
          onSuccess={() => {
            setApprovingStudent(null);
            qc.invalidateQueries({ queryKey: ['pending-signups'] });
            qc.invalidateQueries({ queryKey: ['fee-tree'] });
            qc.invalidateQueries({ queryKey: ['fees-all-students'] });
          }}
        />
      )}

      {approvingIntern && (
        <InternApprovalModal
          intern={approvingIntern}
          onClose={() => setApprovingIntern(null)}
          onSuccess={() => {
            setApprovingIntern(null);
            qc.invalidateQueries({ queryKey: ['pending-signups'] });
            qc.invalidateQueries({ queryKey: ['fee-tree'] });
            qc.invalidateQueries({ queryKey: ['fees-all-students'] });
          }}
        />
      )}
    </div>
  );
}

// ── Unassigned Students Panel ─────────────────────────────────────────────────
// Shows ACTIVE students registered by admin who have no program assigned yet
function UnassignedStudentsPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [assigningStudent, setAssigningStudent] = useState<any | null>(null);
  const [assigningIntern, setAssigningIntern] = useState<any | null>(null);

  const { data: students = [], isLoading } = useQuery<any[]>({
    queryKey: ['unassigned-students'],
    queryFn: async () => {
      const { data } = await api.get('/fees-v2/signups/unassigned');
      return data.data ?? [];
    },
    staleTime: 15_000,
    refetchInterval: open ? 60_000 : false,
    refetchIntervalInBackground: false,
  });

  if (!isLoading && students.length === 0) return null;

  return (
    <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden mb-5">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-amber-50/50 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${students.length > 0 ? 'bg-amber-100' : 'bg-gray-100'}`}>
            <User className={`w-4 h-4 ${students.length > 0 ? 'text-amber-600' : 'text-gray-400'}`} />
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-900 text-sm">Incomplete Setups — Portal Not Configured</p>
            <p className="text-xs text-gray-400">
              {isLoading ? 'Loading…' : students.length > 0
                ? `${students.length} active user${students.length !== 1 ? 's' : ''} need portal setup`
                : 'All users have portal access configured'}
            </p>
          </div>
          {students.length > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{students.length}</span>
          )}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-amber-100">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1, 2].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : students.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">No unassigned students</div>
          ) : (
            <div className="divide-y divide-amber-50 max-h-[400px] overflow-y-auto">
              {students.map((s: any) => (
                <div key={s.id} className="p-5 flex flex-col md:flex-row md:items-start gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 text-base">{s.name}</span>
                      {s.portal_type === 'intern' || s.role === 'INTERN' ? (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-0.5 rounded-full font-medium">Intern Portal</span>
                      ) : (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-medium">Student Portal</span>
                      )}
                      <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full font-medium">Setup Incomplete</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 text-xs text-gray-500">
                      <p className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-gray-400" /> {s.email}</p>
                      <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-gray-400" /> {s.phone_number || '--'}</p>
                      <p className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-gray-400" /> Registered: {fmtDate(s.created_at)}</p>
                      {s.lead_source && <p className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-gray-400" /> {s.lead_source}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end md:self-start flex-shrink-0">
                    {s.portal_type === 'intern' || s.role === 'INTERN' ? (
                      <button onClick={() => setAssigningIntern(s)}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-purple-500 to-fuchsia-500 rounded-xl shadow-md shadow-purple-500/20 hover:opacity-95 transition-all">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Complete Intern Setup
                      </button>
                    ) : (
                      <button onClick={() => setAssigningStudent(s)}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl shadow-md shadow-amber-500/20 hover:opacity-95 transition-all">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Assign Program
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {assigningStudent && (
        <AssignProgramModal
          student={assigningStudent}
          onClose={() => setAssigningStudent(null)}
          onSuccess={() => {
            setAssigningStudent(null);
            qc.invalidateQueries({ queryKey: ['unassigned-students'] });
            qc.invalidateQueries({ queryKey: ['fee-tree'] });
            qc.invalidateQueries({ queryKey: ['fees-all-students'] });
          }}
        />
      )}

      {assigningIntern && (
        <InternApprovalModal
          intern={assigningIntern}
          onClose={() => setAssigningIntern(null)}
          onSuccess={() => {
            setAssigningIntern(null);
            qc.invalidateQueries({ queryKey: ['unassigned-students'] });
            qc.invalidateQueries({ queryKey: ['pending-signups'] });
          }}
        />
      )}
    </div>
  );
}

// ── Assign Program Modal (for admin-registered ACTIVE students) ───────────────
function AssignProgramModal({ student, onClose, onSuccess }: { student: any; onClose: () => void; onSuccess: () => void }) {
  const [selectedProgram, setSelectedProgram]   = useState('');
  const [selectedCourses, setSelectedCourses]   = useState<Set<string>>(new Set());
  const [feesOffered, setFeesOffered]           = useState('');
  const [enrolledMonth, setEnrolledMonth]       = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [remarks, setRemarks]                   = useState('');
  const [submitting, setSubmitting]             = useState(false);
  const [createFeeRecord, setCreateFeeRecord]   = useState(true);

  const { data: programs = [] } = useQuery<any[]>({
    queryKey: ['programs'],
    queryFn: async () => { const { data } = await api.get('/programs'); return data.data ?? []; },
  });

  const activeProgram = programs.find((p: any) => p.id === selectedProgram);

  // When program changes, pre-select all its courses
  function handleProgramChange(progId: string) {
    setSelectedProgram(progId);
    const prog = programs.find((p: any) => p.id === progId);
    if (prog?.courses?.length) {
      setSelectedCourses(new Set((prog.courses as any[]).map((c: any) => c.id)));
    } else {
      setSelectedCourses(new Set());
    }
  }

  function toggleCourse(courseId: string) {
    setSelectedCourses(prev => {
      const s = new Set(prev);
      s.has(courseId) ? s.delete(courseId) : s.add(courseId);
      return s;
    });
  }

  async function handleAssign() {
    if (!selectedProgram) { toast.error('Please select a program'); return; }
    if (createFeeRecord && (!feesOffered || parseFloat(feesOffered) <= 0)) { toast.error('Enter a valid offered fee'); return; }
    setSubmitting(true);
    try {
      // 1. Assign program on user record
      await api.patch(`/learners/${student.id}/program`, { programId: selectedProgram });

      // 2. Auto-enroll student in the program with selected courses
      //    → student portal shows "Enrolled" immediately, no manual click needed
      await api.post(`/fees-v2/signups/${student.id}/enroll-program`, {
        programId: selectedProgram,
        courseIds: Array.from(selectedCourses),
      });

      // 3. Optionally create fee record
      if (createFeeRecord) {
        await api.post(`/fees-v2/students/${student.id}`, {
          fees_offered: parseFloat(feesOffered),
          enrolled_month: enrolledMonth,
          remarks: remarks || undefined,
        });
      }

      toast.success('Student setup complete — portal updated!');
      onSuccess();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Setup failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-amber-50 to-orange-50">
          <div>
            <h2 className="font-bold text-gray-900 text-base">Complete Student Setup</h2>
            <p className="text-xs text-gray-500 mt-0.5">{student.name} · {student.email}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">

          {/* Student info strip */}
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex flex-wrap gap-4 text-xs text-gray-600">
            <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-amber-500" />{student.email}</span>
            {student.phone_number && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-amber-500" />{student.phone_number}</span>}
            {student.qualification && <span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-amber-500" />{student.qualification}</span>}
          </div>

          {/* Step 1 — Program */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Step 1 · Select Program *</p>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {programs.map((p: any) => {
                const color = COLOR_MAP[p.color_token] ?? '#06b6d4';
                const isSel = selectedProgram === p.id;
                return (
                  <button key={p.id} onClick={() => handleProgramChange(p.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      isSel ? 'border-cyan-400 bg-cyan-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: color + '20', border: `1.5px solid ${color}40` }}>
                      <BookOpen className="w-4 h-4" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-400">{(p.courses ?? []).length} course{(p.courses ?? []).length !== 1 ? 's' : ''}</p>
                    </div>
                    {isSel && <CheckCircle2 className="w-4 h-4 text-cyan-500 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2 — Courses (shown after program selected) */}
          {activeProgram && (activeProgram.courses ?? []).length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Step 2 · Courses to Enroll
                <span className="ml-2 text-gray-400 font-normal normal-case">
                  ({selectedCourses.size}/{(activeProgram.courses as any[]).length} selected)
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {(activeProgram.courses as any[]).map((c: any) => {
                  const isSel = selectedCourses.has(c.id);
                  const color = COLOR_MAP[c.color_token] ?? '#06b6d4';
                  return (
                    <button key={c.id} onClick={() => toggleCourse(c.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        isSel
                          ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                          : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                      }`}
                      style={isSel ? { borderColor: color + '60', backgroundColor: color + '10', color } : {}}>
                      {isSel
                        ? <CheckCircle2 className="w-3 h-3 shrink-0" />
                        : <div className="w-3 h-3 rounded-full border border-gray-400 shrink-0" />}
                      {c.title}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">
                Selected courses will show as enrolled in student portal immediately
              </p>
            </div>
          )}

          {/* Step 3 — Fee record toggle */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCreateFeeRecord(v => !v)}>
              <div className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${createFeeRecord ? 'bg-cyan-500' : 'bg-gray-200'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${createFeeRecord ? 'left-5' : 'left-0.5'}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Step 3 · Also create fee record</p>
                <p className="text-xs text-gray-400">Student will see fee details in their portal</p>
              </div>
            </div>
          </div>

          {createFeeRecord && (
            <div className="space-y-3 bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Fees Offered (₹) *</label>
                  <input type="number" value={feesOffered} onChange={e => setFeesOffered(e.target.value)}
                    placeholder="e.g. 25000"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Enrollment Month *</label>
                  <input type="month" value={enrolledMonth} onChange={e => setEnrolledMonth(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Remarks (optional)</label>
                <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2}
                  placeholder="Notes about this student's fee setup..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-400 resize-none" />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50/50 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleAssign} disabled={submitting || !selectedProgram}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl hover:opacity-90 disabled:opacity-50 transition-all shadow-md shadow-amber-500/20">
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up…</>
              : <><CheckCircle2 className="w-4 h-4" /> Complete Setup</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

function StudentApprovalModal({ student, onClose, onSuccess }: { student: any; onClose: () => void; onSuccess: () => void }) {
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [leadSource, setLeadSource] = useState(student.lead_source || '');
  const [feesOffered, setFeesOffered] = useState('');
  const [enrolledMonth, setEnrolledMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Add-on states
  const [addonProgramId, setAddonProgramId] = useState('');
  const [addonCourseId, setAddonCourseId] = useState('');
  const [addonCourses, setAddonCourses] = useState<any[]>([]);

  const { data: programs = [] } = useQuery<any[]>({
    queryKey: ['programs'],
    queryFn: async () => {
      const { data } = await api.get('/programs');
      return data.data ?? [];
    },
  });

  const activeProgram = programs.find(p => p.id === selectedProgram);

  const handleProgramChange = (progId: string) => {
    setSelectedProgram(progId);
    const prog = programs.find(p => p.id === progId);
    if (prog && prog.courses) {
      setSelectedCourses(new Set(prog.courses.map((c: any) => c.id)));
    } else {
      setSelectedCourses(new Set());
    }
    // Reset Add-ons
    setAddonProgramId('');
    setAddonCourseId('');
    setAddonCourses([]);
  };

  const toggleCourseSelect = (courseId: string) => {
    setSelectedCourses(prev => {
      const s = new Set(prev);
      s.has(courseId) ? s.delete(courseId) : s.add(courseId);
      return s;
    });
  };

  const handleAddAddonCourse = () => {
    if (!addonCourseId) return;
    const prog = programs.find(p => p.id === addonProgramId);
    if (!prog) return;
    const course = prog.courses?.find((c: any) => c.id === addonCourseId);
    if (!course) return;

    setSelectedCourses(prev => {
      const s = new Set(prev);
      s.add(course.id);
      return s;
    });

    setAddonCourses(prev => {
      if (prev.some(c => c.id === course.id)) return prev;
      return [...prev, { id: course.id, title: course.title }];
    });

    setAddonCourseId('');
  };

  const handleRemoveAddonCourse = (courseId: string) => {
    setSelectedCourses(prev => {
      const s = new Set(prev);
      s.delete(courseId);
      return s;
    });

    setAddonCourses(prev => prev.filter(c => c.id !== courseId));
  };

  async function handleApprove() {
    if (!selectedProgram) { toast.error('Please select a program'); return; }
    if (selectedCourses.size === 0) { toast.error('Please select at least one course'); return; }
    if (!feesOffered || parseFloat(feesOffered) <= 0) { toast.error('Please enter a valid offered fee'); return; }

    setSubmitting(true);
    try {
      await api.post(`/fees-v2/signups/${student.id}/accept`, {
        program_id: selectedProgram,
        lead_source: leadSource.trim() || undefined,
        course_ids: Array.from(selectedCourses),
        fee_details: {
          fees_offered: parseFloat(feesOffered),
          enrolled_month: enrolledMonth,
          remarks: remarks.trim() || undefined
        }
      });
      toast.success(`${student.name} approved — welcome email sent`);
      onSuccess();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Approval failed.');
    } finally {
      setSubmitting(false);
    }
  }

  const labelCls = 'block text-xs font-semibold text-gray-700 mb-1.5';
  const inputCls = 'w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Approve Student Registration</h2>
            <p className="text-xs text-gray-400 mt-0.5">Assign program, choose courses, and set fee structure for {student.name}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          <div>
            <label className={labelCls}>Choose Program *</label>
            <select
              value={selectedProgram}
              onChange={e => handleProgramChange(e.target.value)}
              className={inputCls + ' cursor-pointer'}
            >
              <option value="">-- Select Program --</option>
              {programs.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {activeProgram && (
            <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50/50 space-y-3">
              <label className="block text-xs font-bold text-gray-800">Check Opted Courses under {activeProgram.name} *</label>
              {activeProgram.courses && activeProgram.courses.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activeProgram.courses.map((c: any) => (
                    <label key={c.id} className={`flex items-start gap-3 p-3 bg-white border rounded-xl cursor-pointer hover:border-cyan-300 transition-all ${selectedCourses.has(c.id) ? 'border-cyan-200 bg-cyan-50/10' : 'border-gray-200'}`}>
                      <input
                        type="checkbox"
                        checked={selectedCourses.has(c.id)}
                        onChange={() => toggleCourseSelect(c.id)}
                        className="mt-0.5 rounded text-cyan-600 focus:ring-cyan-500 border-gray-300 w-4 h-4 cursor-pointer"
                      />
                      <div className="text-xs">
                        <p className="font-semibold text-gray-800">{c.title}</p>
                        <p className="text-gray-400 mt-0.5 font-mono">{c.category} · {c.durationMonths}m</p>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No courses listed under this program.</p>
              )}
            </div>
          )}
          {/* Add-ons Section */}
          {selectedProgram && (
            <div className="border border-dashed border-gray-300 rounded-2xl p-4 bg-gray-50/30 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-gray-800">Add-on Courses (From Other Programs)</label>
                <span className="text-[10px] text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full font-semibold uppercase">Flexibility</span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Choose Add-on Program</label>
                  <select
                    value={addonProgramId}
                    onChange={e => setAddonProgramId(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  >
                    <option value="">-- Choose Program --</option>
                    {programs
                      .filter(p => p.id !== selectedProgram)
                      .map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                  </select>
                </div>

                {addonProgramId && (
                  <div className="border border-gray-200 rounded-xl p-3 bg-white space-y-2">
                    <label className="block text-[10px] font-bold text-gray-700">
                      Check Add-on Courses under {programs.find(p => p.id === addonProgramId)?.name}
                    </label>
                    {programs.find(p => p.id === addonProgramId)?.courses && programs.find(p => p.id === addonProgramId).courses.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {programs.find(p => p.id === addonProgramId).courses.map((c: any) => {
                          const isChecked = selectedCourses.has(c.id);
                          return (
                            <label key={c.id} className={`flex items-start gap-2.5 p-2 border rounded-lg cursor-pointer hover:border-cyan-300 transition-all ${isChecked ? 'border-cyan-200 bg-cyan-50/10' : 'border-gray-200'}`}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  toggleCourseSelect(c.id);
                                  if (!isChecked) {
                                    setAddonCourses(prev => {
                                      if (prev.some(x => x.id === c.id)) return prev;
                                      return [...prev, { id: c.id, title: c.title }];
                                    });
                                  } else {
                                    setAddonCourses(prev => prev.filter(x => x.id !== c.id));
                                  }
                                }}
                                className="mt-0.5 rounded text-cyan-600 focus:ring-cyan-500 border-gray-300 w-3.5 h-3.5 cursor-pointer"
                              />
                              <div className="text-[11px]">
                                <p className="font-semibold text-gray-800">{c.title}</p>
                                <p className="text-gray-400 font-mono text-[9px]">{c.durationMonths || c.duration_months}m</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">No courses listed under this program.</p>
                    )}
                  </div>
                )}
              </div>

              {/* List of currently selected Add-on courses */}
              {addonCourses.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-gray-100">
                  <p className="text-[10px] font-bold text-gray-500">Selected Add-on Courses:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {addonCourses.map(course => (
                      <div key={course.id} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-cyan-50 border border-cyan-200 text-cyan-800 rounded-lg animate-in fade-in slide-in-from-top-1 duration-150">
                        <span>{course.title}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAddonCourse(course.id)}
                          className="text-cyan-500 hover:text-cyan-800 font-bold ml-1 transition-colors"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}



          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Offered Fees (INR) *</label>
              <input
                type="number"
                placeholder="e.g. 45000"
                value={feesOffered}
                onChange={e => setFeesOffered(e.target.value)}
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Enrolled Month *</label>
              <input
                type="month"
                value={enrolledMonth}
                onChange={e => setEnrolledMonth(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Lead Source / Channel</label>
            <select
              value={leadSource}
              onChange={e => setLeadSource(e.target.value)}
              className={inputCls + ' cursor-pointer'}
            >
              <option value="">-- Select Lead Source --</option>
              <option value="fb">FB</option>
              <option value="instagram">Instagram</option>
              <option value="direct walk in">Direct Walk In</option>
              <option value="referral">Referral</option>
              <option value="google">Google</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Remarks / Notes</label>
            <textarea
              placeholder="Add any internal remarks or special configurations here..."
              rows={2}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              className={inputCls + ' resize-none'}
            />
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex gap-3 flex-shrink-0 bg-gray-50/50">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={submitting || !selectedProgram || selectedCourses.size === 0 || !feesOffered}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl hover:opacity-95 shadow-lg shadow-cyan-500/20 disabled:opacity-60 flex items-center justify-center gap-2 transition-all"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Approve & Activate
          </button>
        </div>
      </div>
    </div>
  );
}

// Pending Payment Proofs Panel
function PendingProofsPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [viewImg, setViewImg] = useState<string | null>(null);

  const { data: proofs = [], isLoading } = useQuery<any[]>({
    queryKey: ['pending-proofs'],
    queryFn: async () => { const { data } = await api.get('/payments/proofs/pending'); return data.data ?? []; },
    staleTime: 15_000,
    refetchInterval: open ? 30_000 : false,
    refetchIntervalInBackground: false,
  });

  async function handleVerify(proofId: string, action: 'VERIFIED' | 'REJECTED', note?: string) {
    try {
      await api.patch(`/payments/proofs/${proofId}`, { action, note });
      toast.success(action === 'VERIFIED' ? 'Payment verified! Fee record updated & invoice generated for student.' : 'Proof rejected.');
      qc.invalidateQueries({ queryKey: ['pending-proofs'] });
      qc.invalidateQueries({ queryKey: ['fee-tree'] });
      qc.invalidateQueries({ queryKey: ['fees-all-students'] });
    } catch { toast.error('Action failed'); }
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  const INST_LABELS: Record<string, string> = {
    registration: 'Registration', installment1: '1st Installment',
    installment2: '2nd Installment', installment3: '3rd Installment',
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${proofs.length > 0 ? 'bg-amber-100' : 'bg-gray-100'}`}>
            <Upload className={`w-4 h-4 ${proofs.length > 0 ? 'text-amber-600' : 'text-gray-400'}`} />
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-900 text-sm">Payment Verifications</p>
            <p className="text-xs text-gray-400">{proofs.length > 0 ? `${proofs.length} pending proof${proofs.length !== 1 ? 's' : ''} to verify` : 'No pending verifications'}</p>
          </div>
          {proofs.length > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{proofs.length}</span>
          )}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1, 2].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : proofs.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">No pending verifications</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {proofs.map(p => (
                <div key={p.id} className="flex items-center gap-4 px-5 py-4">
                  {/* Proof thumbnail */}
                  {p.proof_url && (
                    <button onClick={() => setViewImg(p.proof_url)}
                      className="w-14 h-14 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0 hover:opacity-80 transition-opacity">
                      <img src={p.proof_url} alt="proof" className="w-full h-full object-cover" />
                    </button>
                  )}
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{p.student_name}</p>
                    <p className="text-xs text-gray-500">{INST_LABELS[p.installment_key]} &nbsp;·&nbsp; <span className="font-semibold text-gray-700">{fmt(p.amount)}</span></p>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(p.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => handleVerify(p.id, 'VERIFIED')}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verify
                    </button>
                    <button onClick={() => {
                      const note = prompt('Reason for rejection (optional):') ?? undefined;
                      handleVerify(p.id, 'REJECTED', note);
                    }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors">
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Image viewer */}
      {viewImg && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setViewImg(null)}>
          <div className="relative max-w-2xl max-h-[90vh] p-4">
            <img src={viewImg} alt="Payment proof" className="max-w-full max-h-full rounded-2xl shadow-2xl" />
            <button onClick={() => setViewImg(null)} className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Assign Courses Modal — SUPER_ADMIN / ADMIN / FEES_ADMIN only
function AssignCoursesModal({ student, onClose, onSuccess }: {
  student: any; onClose: () => void; onSuccess: () => void;
}) {
  const qc = useQueryClient();
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // All programs (for program picker when student has none)
  const { data: programs = [] } = useQuery<any[]>({
    queryKey: ['programs'],
    queryFn: async () => { const { data } = await api.get('/programs'); return data.data ?? []; },
  });

  // Student's current enrollment state
  const { data: enrollment, isLoading } = useQuery<any>({
    queryKey: ['student-courses', student.id ?? student.student_id],
    queryFn: async () => {
      const { data } = await api.get(`/fees-v2/students/${student.id ?? student.student_id}/courses`);
      return data.data;
    },
    retry: false,
  });

  // Once enrollment loaded, pre-fill program + courses
  useEffect(() => {
    if (!enrollment) return;
    if (enrollment.programId) {
      setSelectedProgram(enrollment.programId);
      setSelectedCourses(
        new Set((enrollment.courses as any[]).filter((c: any) => c.isEnrolled).map((c: any) => c.id))
      );
    }
  }, [enrollment]);

  // When program picker changes (no-program case)
  function handleProgramChange(progId: string) {
    setSelectedProgram(progId);
    const prog = programs.find((p: any) => p.id === progId);
    if (prog?.courses?.length) {
      setSelectedCourses(new Set((prog.courses as any[]).map((c: any) => c.id)));
    } else {
      setSelectedCourses(new Set());
    }
  }

  // Courses to show — from enrollment if program assigned, else from selected program
  const coursesToShow: any[] = enrollment?.programId
    ? (enrollment.courses ?? [])
    : (programs.find((p: any) => p.id === selectedProgram)?.courses ?? []).map((c: any) => ({
        id: c.id, title: c.title, colorToken: c.colorToken ?? c.color_token, isEnrolled: false,
      }));

  const allSelected = coursesToShow.length > 0 && coursesToShow.every((c: any) => selectedCourses.has(c.id));
  const someSelected = coursesToShow.some((c: any) => selectedCourses.has(c.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedCourses(new Set());
    } else {
      setSelectedCourses(new Set(coursesToShow.map((c: any) => c.id)));
    }
  }

  function toggleCourse(courseId: string) {
    setSelectedCourses(prev => {
      const s = new Set(prev);
      s.has(courseId) ? s.delete(courseId) : s.add(courseId);
      return s;
    });
  }

  async function handleSave() {
    if (!selectedProgram) { toast.error('Select a program first'); return; }
    setSubmitting(true);
    try {
      await api.put(`/fees-v2/students/${student.id ?? student.student_id}/courses`, {
        programId: selectedProgram,
        courseIds: Array.from(selectedCourses),
      });
      toast.success('Course enrollment updated — student portal reflects changes immediately');
      qc.invalidateQueries({ queryKey: ['student-courses', student.id ?? student.student_id] });
      qc.invalidateQueries({ queryKey: ['unassigned-students'] });
      qc.invalidateQueries({ queryKey: ['fee-tree'] });
      qc.invalidateQueries({ queryKey: ['fees-all-students'] });
      onSuccess();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to update courses');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveCourse(courseId: string) {
    if (!confirm('Are you sure you want to completely remove the student from this course?')) return;
    setSubmitting(true);
    try {
      await api.delete(`/fees-v2/students/${student.id ?? student.student_id}/courses/${courseId}`);
      toast.success('Student removed from course');
      qc.invalidateQueries({ queryKey: ['student-courses', student.id ?? student.student_id] });
      qc.invalidateQueries({ queryKey: ['fee-tree'] });
      qc.invalidateQueries({ queryKey: ['fees-all-students'] });
      onSuccess();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to remove course');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveAllCourses() {
    if (!confirm('WARNING: Are you sure you want to remove the student from ALL courses? This will wipe their enrollments.')) return;
    setSubmitting(true);
    try {
      await api.delete(`/fees-v2/students/${student.id ?? student.student_id}/courses`);
      toast.success('Student removed from all courses');
      qc.invalidateQueries({ queryKey: ['student-courses', student.id ?? student.student_id] });
      qc.invalidateQueries({ queryKey: ['fee-tree'] });
      qc.invalidateQueries({ queryKey: ['fees-all-students'] });
      onSuccess();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to remove courses');
    } finally {
      setSubmitting(false);
    }
  }

  const activeProgram = enrollment?.programId
    ? programs.find((p: any) => p.id === enrollment.programId)
    : programs.find((p: any) => p.id === selectedProgram);

  const programColor = COLOR_MAP[enrollment?.programColor ?? activeProgram?.color_token] ?? '#6366f1';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-indigo-50 to-purple-50">
          <div>
            <h2 className="font-bold text-gray-900 text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              Manage Course Enrollment
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{student.name} · {student.email}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">

          {/* Program indicator / picker */}
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading enrollment…
            </div>
          ) : enrollment?.programId ? (
            <div className="flex items-center gap-3 p-3 rounded-xl border"
              style={{ backgroundColor: programColor + '10', borderColor: programColor + '30' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: programColor + '20' }}>
                <BookOpen className="w-4 h-4" style={{ color: programColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">{enrollment.programName}</p>
                <p className="text-xs text-gray-500">Assigned program · {enrollment.courses?.length ?? 0} courses available</p>
              </div>
            </div>
          ) : (
            // No program — show picker
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Select Program</p>
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {programs.map((p: any) => {
                  const color = COLOR_MAP[p.color_token] ?? '#06b6d4';
                  const isSel = selectedProgram === p.id;
                  return (
                    <button key={p.id} onClick={() => handleProgramChange(p.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                        isSel ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: color + '20' }}>
                        <BookOpen className="w-3.5 h-3.5" style={{ color }} />
                      </div>
                      <p className="text-sm font-semibold text-gray-900 flex-1">{p.name}</p>
                      {isSel && <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Course list */}
          {coursesToShow.length > 0 && (
            <div>
              {/* Select All row */}
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors mb-3"
                onClick={toggleSelectAll}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                  allSelected
                    ? 'bg-indigo-500 border-indigo-500'
                    : someSelected
                      ? 'bg-indigo-200 border-indigo-400'
                      : 'border-gray-400 bg-white'
                }`}>
                  {allSelected && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                      <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  {someSelected && !allSelected && (
                    <div className="w-2 h-0.5 bg-indigo-600 rounded" />
                  )}
                </div>
                <span className="text-sm font-semibold text-gray-700">
                  {allSelected ? 'Deselect All' : 'Select All'}
                </span>
                <span className="ml-auto text-xs text-gray-400">
                  {selectedCourses.size} / {coursesToShow.length} selected
                </span>
              </div>

              {/* Individual courses */}
              <div className="space-y-2">
                {coursesToShow.map((c: any) => {
                  const color = COLOR_MAP[c.colorToken ?? c.color_token] ?? '#6366f1';
                  const isSel = selectedCourses.has(c.id);
                  return (
                    <div
                      key={c.id}
                      onClick={() => toggleCourse(c.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        isSel
                          ? 'border-indigo-200 bg-indigo-50/60'
                          : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {/* Checkbox */}
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                        isSel ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300 bg-white'
                      }`}>
                        {isSel && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                            <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>

                      {/* Course icon */}
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: color + '20' }}>
                        <BookOpen className="w-3.5 h-3.5" style={{ color }} />
                      </div>

                      {/* Title */}
                      <p className={`text-sm font-medium flex-1 ${isSel ? 'text-gray-900' : 'text-gray-600'}`}>
                        {c.title}
                      </p>

                      {/* Already enrolled badge / Remove button */}
                      {c.isEnrolled && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100 font-semibold shrink-0">
                            Enrolled
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveCourse(c.id);
                            }}
                            className="p-1 rounded-md text-rose-500 hover:bg-rose-100 transition-colors"
                            title="Remove student from this course"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !selectedProgram && !enrollment?.programId && (
            <p className="text-center text-sm text-gray-400 py-4">Select a program above to see its courses</p>
          )}
          {!isLoading && selectedProgram && coursesToShow.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-4">No active courses in this program</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50/50 flex flex-col gap-3">
          {enrollment?.programId && coursesToShow.some((c: any) => c.isEnrolled) && (
            <button
              onClick={handleRemoveAllCourses}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> Remove from All Courses
            </button>
          )}
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={submitting || !selectedProgram}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl hover:opacity-90 disabled:opacity-50 transition-all shadow-md shadow-indigo-500/20">
              {submitting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : <><CheckCircle2 className="w-4 h-4" /> Save Enrollment</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// UPI Settings Modal
function UpiSettingsModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: upi, isLoading } = useQuery<any>({
    queryKey: ['upi-settings'],
    queryFn: async () => { const { data } = await api.get('/payments/upi'); return data.data; },
  });

  const [upiId, setUpiId] = useState('');
  const [upiName, setUpiName] = useState('Vtricks LMS');
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Pre-fill once data loads
  if (upi && !initialized) {
    setUpiId(upi.upi_id ?? '');
    setUpiName(upi.upi_name ?? 'Vtricks LMS');
    setInitialized(true);
  }

  async function save() {
    if (!upiId.trim()) { toast.error('UPI ID is required'); return; }
    setSaving(true);
    try {
      await api.put('/payments/upi', { upi_id: upiId.trim(), upi_name: upiName.trim() || 'Vtricks LMS' });
      toast.success('UPI settings saved');
      qc.invalidateQueries({ queryKey: ['upi-settings'] });
      onClose();
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  }

  const inputCls = 'w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">UPI Payment Settings</h2>
            <p className="text-xs text-gray-500 mt-0.5">Students will pay to this UPI ID</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {isLoading ? (
            <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">UPI ID *</label>
                <input
                  value={upiId}
                  onChange={e => setUpiId(e.target.value)}
                  placeholder="e.g. vtricks@upi or 9876543210@paytm"
                  className={inputCls}
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">This appears on the QR code shown to students</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Display Name</label>
                <input
                  value={upiName}
                  onChange={e => setUpiName(e.target.value)}
                  placeholder="e.g. Vtricks LMS"
                  className={inputCls}
                />
              </div>
              {/* Preview */}
              {upiId && (
                <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-cyan-700 mb-1">Preview</p>
                  <p className="text-xs text-cyan-600 font-mono">upi://pay?pa={upiId}&pn={upiName}&am=...&cu=INR</p>
                </div>
              )}
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
                <strong>How it works:</strong> When a student clicks "Pay Now", a QR code is generated with your UPI ID and the exact amount. They scan with PhonePe / GPay / Paytm and upload a screenshot. You verify and mark as paid.
              </div>
            </>
          )}
        </div>
        <div className="p-6 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">Cancel</button>
          <button onClick={save} disabled={saving || !upiId.trim() || isLoading}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
