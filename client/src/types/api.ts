export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'TRAINER' | 'STUDENT';
export type CourseStatus = 'ACTIVE' | 'NEW' | 'DRAFT' | 'ARCHIVED';
export type CourseLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type BatchStatus = 'UPCOMING' | 'ONGOING' | 'COMPLETED';
export type ColorToken = 'emerald' | 'cyan' | 'purple' | 'amber' | 'rose' | 'indigo' | 'sky' | 'orange';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string | null;
  createdAt: string;
}

export interface Course {
  id: string;
  title: string;
  category: string;
  status: CourseStatus;
  level: CourseLevel;
  durationMonths: number;
  description?: string | null;
  trainerId?: string | null;
  trainer?: { id: string; name: string } | null;
  colorToken: string;
  batchCount?: number;
  studentCount?: number;
  completionPct?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Batch {
  id: string;
  name: string;
  courseId: string;
  course?: { id: string; title: string; category: string };
  startDate: string;
  endDate: string;
  capacity: number;
  status: BatchStatus;
  createdAt: string;
  _count?: { enrollments: number };
  enrollments?: Enrollment[];
}

export interface Enrollment {
  id: string;
  completionPct: number;
  grade?: string | null;
  enrolledAt: string;
  student: { id: string; name: string; email: string };
}

export interface Trainer {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  bio?: string | null;
  skills?: string | null;
  linkedin?: string | null;
  phone?: string | null;
  createdAt: string;
  courseCount: number;
  studentCount: number;
  activeBatches: number;
  courses?: TrainerCourse[];
  enrollmentTrend?: { month: string; count: number }[];
}

export interface TrainerCourse {
  id: string;
  title: string;
  category: string;
  status: CourseStatus;
  level: CourseLevel;
  durationMonths: number;
  colorToken: string;
  batchCount: number;
  studentCount: number;
  completionPct: number;
}

export interface SyllabusSession {
  session:  string | number;
  module:   string;
  topics:   string[];
  duration: number | null;
}

export interface SyllabusSheet {
  name:        string;
  courseTitle: string;
  sessions:    SyllabusSession[];
}

export interface StructuredSyllabus {
  type:   'excel_structured' | 'csv_structured';
  sheets: SyllabusSheet[];
}

export interface SyllabusContent {
  id:             string;
  filename:       string;
  fileType:       'PDF' | 'EXCEL' | 'CSV';
  label:          string | null;
  contentText:    string;
  structuredData: StructuredSyllabus | null;
  createdAt:      string;
  uploadedByName?: string;
}

export interface DashboardStats {
  totalCourses: number;
  totalStudents: number;
  activeBatches: number;
  activeCourses: number;
  totalTrainers: number;
  categoryDistribution: { category: string; count: number }[];
  topCourses: { id: string; title: string; category: string; studentCount: number; completionPct: number }[];
  enrollmentTrend: { month: string; count: number }[];
  batchDistribution: { status: string; count: number }[];
  topTrainers: { id: string; name: string; courseCount: number; studentCount: number }[];
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  courses: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface AvailableStudent {
  id: string;
  name: string;
  email: string;
}

export type ModuleStatus = 'LOCKED' | 'RELEASED' | 'COMPLETED';
export type QuizStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type AssignmentStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';

export interface CourseModule {
  id: string;
  courseId: string;
  title: string;
  description?: string | null;
  sortOrder: number;
  status: ModuleStatus;
  completedAt?: string | null;
  completedByName?: string | null;
  quizId?: string | null;
  quizTitle?: string | null;
  quizStatus?: string | null;
  questionCount: number;
}

export interface QuizDataset {
  id: string;
  courseId: string;
  courseTitle?: string;
  title: string;
  filename: string;
  fileType: string;
  preview?: string;
  contentLength?: number;
  contentText?: string;
  filePath?: string;
  createdAt: string;
  uploadedByName?: string;
}

export interface QuizQuestion {
  id: string;
  courseId: string;
  moduleId?: string | null;
  moduleTitle?: string;
  datasetId?: string | null;
  questionText: string;
  questionType: 'MCQ' | 'TRUE_FALSE' | 'SHORT_ANSWER';
  options?: string[] | null;
  correctAnswer: string;
  explanation?: string | null;
  points: number;
  difficulty: string;
  tags?: string | null;
}

export interface Quiz {
  id: string;
  courseId: string;
  courseTitle?: string;
  moduleId: string;
  moduleTitle?: string;
  moduleStatus?: ModuleStatus;
  moduleOrder?: number;
  title: string;
  description?: string | null;
  questionsPerAttempt: number;
  timeLimitMinutes?: number | null;
  passingScore: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  maxAttempts: number;
  status: QuizStatus;
  poolSize: number;
  isReleased?: boolean;
}

export interface Assignment {
  id: string;
  courseId: string;
  courseTitle?: string;
  moduleId?: string | null;
  moduleTitle?: string | null;
  title: string;
  description?: string | null;
  pdfFilename: string;
  pdfPath: string;
  pdfSizeBytes?: number;
  dueDate?: string | null;
  maxScore: number;
  status: AssignmentStatus;
  batchCount?: number;
  submissionCount?: number;
  batches?: { id: string; name: string; status: string }[];
  submissions?: AssignmentSubmission[];
}

export interface AssignmentSubmission {
  id: string;
  studentId: string;
  studentName: string;
  submittedAt: string;
  score?: number | null;
  feedback?: string | null;
  status: string;
}

export interface BatchAnalytics {
  batch: {
    id: string; name: string; capacity: number; status: string;
    startDate: string; endDate: string; courseTitle: string;
  };
  totalEnrolled: number;
  capacity: number;
  avgCompletion: number;
  completed100: number;
  completionBuckets: { range: string; count: number }[];
  students: { studentName: string; completionPct: number; grade?: string | null; enrolledAt: string }[];
}
