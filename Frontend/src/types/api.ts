export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'TRAINER' | 'STUDENT' | 'FEES_ADMIN' | 'LD_MANAGER' | 'OPERATIONAL_MANAGER' | 'INTERN';
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
  phoneNumber?: string | null;
  dateOfBirth?: string | null;
  occupation?: string | null;
  qualification?: string | null;
  graduationYear?: string | null;
  classPreference?: string | null;
  leadSource?: string | null;
  address?: string | null;
  accountStatus?: string | null;
  githubUsername?: string | null;
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
  programId?: string | null;
  batchCount?: number;
  studentCount?: number;
  completionPct?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Batch {
  id: string;
  name: string;
  courseId?: string;
  course?: { id: string; title: string; category: string };
  programId?: string;
  program?: { id: string; name: string; colorToken: string };
  startDate: string;
  endDate: string;
  capacity: number;
  status: BatchStatus;
  createdAt: string;
  trainerId?: string | null;
  trainerName?: string | null;
  classStartTime?: string | null;
  classEndTime?: string | null;
  classDays?: string | null;
  scheduleNotes?: string | null;
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
  filePath?:      string | null;
  fileUrl?:       string | null;   // presigned S3 URL
  createdAt:      string;
  uploadedByName?: string;
  rawText?: string | null;
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
  ungradedSubmissions: number;
  overdueAssignments: number;
  sessionStats: { total: number; released: number; completed: number; locked: number };
  sessionDelivery: { id: string; title: string; colorToken: string; total: number; released: number; completed: number }[];
}

export interface Program {
  id: string;
  name: string;
  description?: string | null;
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  // Friend's program-centric fields (superset)
  colorToken?: string;
  sortOrder?: number;
  isActive?: boolean;
  studentCount?: number;
  createdAt?: string;
  courses?: {
    id: string;
    title: string;
    category: string;
    colorToken: string;
    durationMonths: number;
  }[];
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
  phoneNumber?: string | null;
}

export type ModuleStatus = 'LOCKED' | 'RELEASED' | 'COMPLETED';
export type QuizStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type AssignmentStatus  = 'DRAFT' | 'PUBLISHED' | 'CLOSED';
export type AssessmentStatus  = 'DRAFT' | 'PUBLISHED' | 'CLOSED';

export interface CourseModule {
  id: string;
  courseId: string;
  title: string;
  description?: string | null;
  section?: string | null;
  sessionNumber?: string | null;
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
  fileUrl?: string;   // presigned S3 URL
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
  moduleSessionNumber?: string | null;
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
  batchIds?: string[];
  batchCount?: number;
}

export interface Assignment {
  id: string;
  courseId: string;
  courseTitle?: string;
  moduleId?: string | null;
  moduleTitle?: string | null;
  moduleSessionNumber?: string | null;
  title: string;
  description?: string | null;
  pdfFilename: string;
  pdfPath: string;
  pdfUrl?: string;    // presigned S3 URL — resolved server-side
  pdfSizeBytes?: number;
  dueDate?: string | null;
  maxScore: number;
  status: AssignmentStatus;
  batchCount?: number;
  submissionCount?: number;
  batchIds?: string[];
  batches?: { id: string; name: string; status: string }[];
  submissions?: AssignmentSubmission[];
}

export interface Assessment {
  id: string;
  courseId: string;
  courseTitle?: string;
  title: string;
  description?: string | null;
  pdfFilename: string;
  pdfPath: string;
  pdfUrl?: string;
  pdfSizeBytes?: number;
  dueDate?: string | null;
  totalMarks: number;
  partAMarks: number;
  partBMarks: number;
  partBApproachPct: number;
  partBVivaPct: number;
  partAFilename?: string | null;
  hasPartA?: boolean;
  partAQuestions?: Array<{ id: string; questionText: string; options: string[]; points: number }> | null;
  status: AssessmentStatus;
  batchCount?: number;
  submissionCount?: number;
  batches?: { id: string; name: string; status: string }[];
  submissions?: AssessmentSubmission[];
}

export interface AssessmentSubmission {
  id: string;
  studentId: string;
  studentName: string;
  submittedAt: string;
  partAScore?: number | null;
  approachScore?: number | null;
  vivaScore?: number | null;
  solutionScore?: number | null;
  totalScore?: number | null;
  feedback?: string | null;
  status: string;
  fileUrl?: string | null;
  gradedAt?: string | null;
  aiStatus?: string;
  aiApproachScore?: number | null;
  aiSolutionScore?: number | null;
  aiFeedback?: string | null;
}

export interface AssignmentSubmission {
  id: string;
  studentId: string;
  studentName: string;
  submittedAt: string;
  score?: number | null;
  feedback?: string | null;
  status: string;
  fileUrl?: string | null;
  zipUrl?: string | null;
}

export interface TrainerPermissions {
  trainerId:            string;
  canEditCourses:       boolean;
  canDeleteCourses:     boolean;
  canEditBatches:       boolean;
  canDeleteBatches:     boolean;
  canEditLearners:      boolean;
  canDeleteLearners:    boolean;
  canEditAssignments:   boolean;
  canDeleteAssignments: boolean;
  canEditQuizzes:       boolean;
  canDeleteQuizzes:     boolean;
  canEditAttendance:    boolean;
  canDeleteAttendance:  boolean;
  canSoftDeleteOnly:    boolean;
  // Sidebar visibility (default true — when false, section hidden from trainer sidebar)
  canViewCourses:       boolean;
  canViewBatches:       boolean;
  canViewLearners:      boolean;
  canViewAssignments:   boolean;
  canViewQuizzes:       boolean;
  canViewAttendance:    boolean;
  canViewContent:       boolean;
  canViewRecordings:    boolean;
  updatedAt:            string;
  updatedByName:        string | null;
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
  students: {
    id: string;
    name: string;
    email: string;
    studentName: string;
    completionPct: number;
    enrolledAt: string;
    grade?: string | null;
  }[];
  completed: number;
}

// ── Student portal types ───────────────────────────────────────────────────────

export interface StudentEnrollmentItem {
  enrollmentId:   string;
  courseId:       string;
  courseTitle:    string;
  courseCategory: string;
  courseLevel?:   string;
  colorToken:     string;
  batchId:        string;
  batchName:      string;
  batchStatus:    string;
  trainerName:    string | null;
  completionPct:  number;
  enrolledAt:     string;
  startDate?:     string;
  endDate?:       string;
}

export interface StudentAttendanceMonth {
  month:   string;
  present: number;
  late:    number;
  absent:  number;
  total:   number;
}

export interface StudentDashboardData {
  enrolled: boolean;
  enrollments: StudentEnrollmentItem[];
  primaryEnrollment: (StudentEnrollmentItem & {
    courseLevel: string;
    startDate: string;
    endDate: string;
  }) | null;
  nextSession: {
    id: string;
    title: string;
    sessionNumber: string | null;
    batchId: string;
    enrollmentId: string;
    courseId: string;
  } | null;
  attendance: {
    total:        number;
    present:      number;
    late:         number;
    absent:       number;
    overall:      number;   // percentage
    monthly:      StudentAttendanceMonth[];
  };
  assignments: {
    pending:   number;
    completed: number;
    upcoming: {
      id:          string;
      title:       string;
      dueDate:     string | null;
      maxScore:    number;
      courseTitle: string;
      colorToken:  string;
    }[];
  };
  quizzes: {
    pending:   number;
    completed: number;
    recentAttempts: {
      id:          string;
      quizId:      string;
      quizTitle:   string;
      score:       number | null;
      passed:      boolean | null;
      submittedAt: string;
      courseTitle: string;
    }[];
    pendingList?: {
      quizId: string;
      quizTitle: string;
      courseTitle: string;
      enrollmentId: string;
    }[];
  };
  sessions?: { total: number; released: number; completed: number };
}

export interface Assignment {
  id: string;
  courseId: string;
  courseTitle?: string;
  moduleId?: string | null;
  moduleTitle?: string | null;
  moduleSessionNumber?: string | null;
  title: string;
  description?: string | null;
  pdfFilename: string;
  pdfPath: string;
  pdfUrl?: string;    // presigned S3 URL — resolved server-side
  pdfSizeBytes?: number;
  dueDate?: string | null;
  maxScore: number;
  status: AssignmentStatus;
  batchCount?: number;
  submissionCount?: number;
  batchIds?: string[];
  batches?: { id: string; name: string; status: string }[];
  submissions?: AssignmentSubmission[];
}

export interface Assessment {
  id: string;
  courseId: string;
  courseTitle?: string;
  title: string;
  description?: string | null;
  pdfFilename: string;
  pdfPath: string;
  pdfUrl?: string;
  pdfSizeBytes?: number;
  dueDate?: string | null;
  totalMarks: number;
  partAMarks: number;
  partBMarks: number;
  partBApproachPct: number;
  partBVivaPct: number;
  partAFilename?: string | null;
  hasPartA?: boolean;
  partAQuestions?: Array<{ id: string; questionText: string; options: string[]; points: number }> | null;
  status: AssessmentStatus;
  batchCount?: number;
  submissionCount?: number;
  batches?: { id: string; name: string; status: string }[];
  submissions?: AssessmentSubmission[];
}

export interface AssessmentSubmission {
  id: string;
  studentId: string;
  studentName: string;
  submittedAt: string;
  partAScore?: number | null;
  approachScore?: number | null;
  vivaScore?: number | null;
  solutionScore?: number | null;
  totalScore?: number | null;
  feedback?: string | null;
  status: string;
  fileUrl?: string | null;
  gradedAt?: string | null;
  aiStatus?: string;
  aiApproachScore?: number | null;
  aiSolutionScore?: number | null;
  aiFeedback?: string | null;
}

export interface AssignmentSubmission {
  id: string;
  studentId: string;
  studentName: string;
  submittedAt: string;
  score?: number | null;
  feedback?: string | null;
  status: string;
  fileUrl?: string | null;
  zipUrl?: string | null;
}

export interface TrainerPermissions {
  trainerId:            string;
  canEditCourses:       boolean;
  canDeleteCourses:     boolean;
  canEditBatches:       boolean;
  canDeleteBatches:     boolean;
  canEditLearners:      boolean;
  canDeleteLearners:    boolean;
  canEditAssignments:   boolean;
  canDeleteAssignments: boolean;
  canEditQuizzes:       boolean;
  canDeleteQuizzes:     boolean;
  canEditAttendance:    boolean;
  canDeleteAttendance:  boolean;
  canSoftDeleteOnly:    boolean;
  // Sidebar visibility (default true — when false, section hidden from trainer sidebar)
  canViewCourses:       boolean;
  canViewBatches:       boolean;
  canViewLearners:      boolean;
  canViewAssignments:   boolean;
  canViewQuizzes:       boolean;
  canViewAttendance:    boolean;
  canViewContent:       boolean;
  canViewRecordings:    boolean;
  updatedAt:            string;
  updatedByName:        string | null;
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
  students: {
    id: string;
    name: string;
    email: string;
    studentName: string;
    completionPct: number;
    enrolledAt: string;
    grade?: string | null;
  }[];
  completed: number;
}

// ── Student portal types ───────────────────────────────────────────────────────

export interface StudentEnrollmentItem {
  enrollmentId:   string;
  courseId:       string;
  courseTitle:    string;
  courseCategory: string;
  courseLevel?:   string;
  colorToken:     string;
  batchId:        string;
  batchName:      string;
  batchStatus:    string;
  trainerName:    string | null;
  completionPct:  number;
  enrolledAt:     string;
  startDate?:     string;
  endDate?:       string;
}

export interface StudentAttendanceMonth {
  month:   string;
  present: number;
  late:    number;
  absent:  number;
  total:   number;
}

export interface StudentDashboardData {
  enrolled: boolean;
  enrollments: StudentEnrollmentItem[];
  primaryEnrollment: (StudentEnrollmentItem & {
    courseLevel: string;
    startDate: string;
    endDate: string;
  }) | null;
  nextSession: {
    id: string;
    title: string;
    sessionNumber: string | null;
    batchId: string;
    enrollmentId: string;
    courseId: string;
  } | null;
  attendance: {
    total:        number;
    present:      number;
    late:         number;
    absent:       number;
    overall:      number;   // percentage
    monthly:      StudentAttendanceMonth[];
  };
  assignments: {
    pending:   number;
    completed: number;
    upcoming: {
      id:          string;
      title:       string;
      dueDate:     string | null;
      maxScore:    number;
      courseTitle: string;
      colorToken:  string;
    }[];
  };
  quizzes: {
    pending:   number;
    completed: number;
    recentAttempts: {
      id:          string;
      quizId:      string;
      quizTitle:   string;
      score:       number | null;
      passed:      boolean | null;
      submittedAt: string;
      courseTitle: string;
    }[];
    pendingList?: {
      quizId: string;
      quizTitle: string;
      courseTitle: string;
      enrollmentId: string;
    }[];
  };
  sessions?: { total: number; released: number; completed: number };
}

export interface MockInterview {
  id: string;
  student_id: string;
  trainer_id: string;
  course_id?: string | null;
  created_by: string;
  start_time: string;
  end_time: string;
  meeting_link: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  score?: number | null;
  feedback?: string | null;
  key_strengths?: string | null;
  areas_of_improvement?: string | null;
  is_ai_driven?: boolean;
  is_published?: boolean;
  ai_topic?: string | null;
  ai_domain?: string | null;
  ai_experience?: string | null;
  ai_context_file_url?: string | null;
  student?: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string | null;
  };
  trainer?: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string | null;
  };
  creator?: {
    id: string;
    name: string;
  };
  course?: {
    id: string;
    title: string;
  };
  created_at: string;
  updated_at: string;
}
