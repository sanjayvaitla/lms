import { Routes, Route, Navigate } from 'react-router';
import { ReactNode, Suspense, lazy, Component, ErrorInfo } from 'react';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { StudentLayout } from './components/StudentLayout';
import { InternLayout } from './components/InternLayout';
import { useAuth } from '../store/AuthContext';
import { Skeleton } from './components/ui/skeleton';
import { ActivityTracker } from './components/ActivityTracker';

// Auth pages — small, loaded eagerly (used before auth)
import LoginPage from './pages/Login';
import SignupPage from './pages/Signup';
import ForgotPasswordPage from './pages/ForgotPassword';
import ResetPasswordPage from './pages/ResetPassword';
import AuthCallbackPage from './pages/AuthCallback';

// Admin pages — lazy loaded
const DashboardPage        = lazy(() => import('./pages/Dashboard'));
const CourseMasterPage     = lazy(() => import('./pages/CourseMaster'));
const BatchMasterPage      = lazy(() => import('./pages/BatchMaster'));
const CourseAnalyticsPage  = lazy(() => import('./pages/CourseAnalytics'));
const TrainerMasterPage    = lazy(() => import('./pages/TrainerMaster'));
const AssignmentMasterPage  = lazy(() => import('./pages/AssignmentMaster'));
const AssessmentMasterPage  = lazy(() => import('./pages/AssessmentMaster'));
const QuizMasterPage       = lazy(() => import('./pages/QuizMaster'));
const FeedbackMasterPage  = lazy(() => import('./pages/FeedbackMaster'));
const GrievanceMasterPage = lazy(() => import('./pages/GrievanceMaster'));

const ContentMasterPage    = lazy(() => import('./pages/ContentMaster'));
const LearnerMasterPage    = lazy(() => import('./pages/LearnerMaster'));
const AttendanceMasterPage = lazy(() => import('./pages/AttendanceMaster'));
const FeesMasterPage = lazy(() => import('./pages/FeesMaster'));
const RoleControlPage = lazy(() => import('./pages/RoleControl'));
const RecordingsMasterPage = lazy(() => import('./pages/RecordingsMaster'));
const CodingMasterPage = lazy(() => import('./pages/CodingMaster'));
const InvoiceViewPage = lazy(() => import('./pages/InvoiceView'));
const MessagingPage = lazy(() => import('./pages/Messaging'));
const MockInterviewManager = lazy(() => import('./pages/MockInterviewManager'));
const PlacementMasterPage = lazy(() => import('./pages/PlacementMaster'));
const InternshipMasterPage = lazy(() => import('./pages/InternshipMaster'));
const AnalyticsDashboardPage = lazy(() => import('./pages/AnalyticsDashboard'));

// Student pages — lazy loaded
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));
const MyCodingTestsPage = lazy(() => import('./pages/student/MyCodingTests'));
const ProgramEnrollmentPage = lazy(() => import('./pages/student/ProgramEnrollment'));
const MyFeesPage = lazy(() => import('./pages/student/MyFees'));
const MyCoursesPage = lazy(() => import('./pages/student/MyCourses'));
const CourseDetailPage = lazy(() => import('./pages/student/CourseDetail'));
const SessionDetailPage = lazy(() => import('./pages/student/SessionDetail'));
const MyAttendancePage  = lazy(() => import('./pages/student/MyAttendance'));
const MyProfilePage     = lazy(() => import('./pages/student/MyProfile'));
const MyAssignmentsPage  = lazy(() => import('./pages/student/MyAssignments'));
const MyAssessmentsPage  = lazy(() => import('./pages/student/MyAssessments'));
const MyQuizzesPage     = lazy(() => import('./pages/student/MyQuizzes'));
const QuizAttemptPage   = lazy(() => import('./pages/student/QuizAttempt'));
const MyMockInterviewsPage = lazy(() => import('./pages/student/MyMockInterviews'));
const AIMockInterviewSessionPage = lazy(() => import('./pages/student/AIMockInterviewSession'));
const PlacementPortalPage = lazy(() => import('./pages/student/PlacementPortal'));
const MyGrievancesPage = lazy(() => import('./pages/student/MyGrievances'));
const InternPortalPage = lazy(() => import('./pages/student/InternPortal'));

function PageLoader() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

function PortalRoot() {
  const { user } = useAuth();
  if (user?.role === 'STUDENT') return <StudentLayout />;
  if (user?.role === 'INTERN') return <InternLayout />;
  return <Layout />;
}

function StudentOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'STUDENT') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/** Students + interns (shared learner pages like My Profile) */
function LearnerOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'STUDENT' && user?.role !== 'INTERN') {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function InternOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'INTERN') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role === 'STUDENT' || user?.role === 'INTERN') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function SuperAdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'SUPER_ADMIN') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function DashboardRouter() {
  const { user } = useAuth();
  if (user?.role === 'STUDENT') return <StudentDashboard />;
  if (user?.role === 'INTERN') return <Navigate to="/intern/portal" replace />;
  if (user?.role === 'FEES_ADMIN') return <Navigate to="/fees" replace />;
  return <DashboardPage />;
}

class AppErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App Error Boundary caught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-10 m-10 bg-red-50 border border-red-500 rounded-xl">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Something went wrong.</h1>
          <p className="text-red-800 mb-4">The application encountered a rendering error during navigation.</p>
          <pre className="bg-white p-4 rounded text-sm text-red-900 overflow-auto border border-red-200">
            {this.state.error?.toString()}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Reload Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AppErrorBoundary>
        <ActivityTracker />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <PortalRoot />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />

          <Route path="dashboard" element={<DashboardRouter />} />

          {/* ── Student routes ─────────────────────────────────────────── */}
          <Route path="my-courses"
            element={<StudentOnly><MyCoursesPage /></StudentOnly>} />
          <Route path="my-courses/:enrollmentId"
            element={<StudentOnly><CourseDetailPage /></StudentOnly>} />
          <Route path="my-courses/:enrollmentId/session/:moduleId"
            element={<StudentOnly><SessionDetailPage /></StudentOnly>} />
          <Route path="my-courses/:enrollmentId/quiz/:quizId"
            element={<StudentOnly><QuizAttemptPage /></StudentOnly>} />
          <Route path="my-attendance"
            element={<StudentOnly><MyAttendancePage /></StudentOnly>} />
          <Route path="my-assignments"
            element={<StudentOnly><MyAssignmentsPage /></StudentOnly>} />
          <Route path="my-assessments"
            element={<StudentOnly><MyAssessmentsPage /></StudentOnly>} />
          <Route path="my-quizzes"
            element={<StudentOnly><MyQuizzesPage /></StudentOnly>} />
          <Route path="my-coding"
            element={<StudentOnly><MyCodingTestsPage /></StudentOnly>} />
          <Route path="programs"
            element={<StudentOnly><ProgramEnrollmentPage /></StudentOnly>} />
          <Route path="my-fees"
            element={<StudentOnly><MyFeesPage /></StudentOnly>} />
          <Route path="my-profile"
            element={<LearnerOnly><MyProfilePage /></LearnerOnly>} />
          <Route path="my-mock-interviews" 
            element={<StudentOnly><MyMockInterviewsPage /></StudentOnly>} />
          <Route path="my-mock-interviews/ai/:id" 
            element={<StudentOnly><AIMockInterviewSessionPage /></StudentOnly>} />
          <Route path="my-placements"
            element={<StudentOnly><PlacementPortalPage /></StudentOnly>} />
          <Route path="my-grievances"
            element={<StudentOnly><MyGrievancesPage /></StudentOnly>} />

          <Route path="intern/portal"
            element={<InternOnly><InternPortalPage /></InternOnly>} />

          {/* ── Admin / Trainer routes ─────────────────────────────────── */}
          <Route path="courses"
            element={<AdminOnly><CourseMasterPage /></AdminOnly>} />
          <Route path="batches"
            element={<AdminOnly><BatchMasterPage /></AdminOnly>} />
          <Route path="courses/:id/analytics"
            element={<AdminOnly><CourseAnalyticsPage /></AdminOnly>} />
          <Route path="trainers"
            element={<AdminOnly><TrainerMasterPage /></AdminOnly>} />
          <Route path="assignments"
            element={<AdminOnly><AssignmentMasterPage /></AdminOnly>} />
          <Route path="assessments"
            element={<AdminOnly><AssessmentMasterPage /></AdminOnly>} />
          <Route path="quizzes"
            element={<AdminOnly><QuizMasterPage /></AdminOnly>} />
          <Route path="content"
            element={<AdminOnly><ContentMasterPage /></AdminOnly>} />
          <Route path="learners"
            element={<AdminOnly><LearnerMasterPage /></AdminOnly>} />
          <Route path="attendance"
            element={<AdminOnly><AttendanceMasterPage /></AdminOnly>} />
          <Route path="role-control"
            element={<AdminOnly><RoleControlPage /></AdminOnly>} />
          <Route path="recordings"
            element={<AdminOnly><RecordingsMasterPage /></AdminOnly>} />
          <Route path="coding-tests"
            element={<AdminOnly><CodingMasterPage /></AdminOnly>} />
          <Route path="fees"
            element={<AdminOnly><FeesMasterPage /></AdminOnly>} />
          <Route path="projects"
            element={<AdminOnly><ComingSoon title="Project Master" icon="🗂️" /></AdminOnly>} />
          <Route path="placements"
            element={<AdminOnly><PlacementMasterPage /></AdminOnly>} />
          <Route path="internships"
            element={<AdminOnly><InternshipMasterPage /></AdminOnly>} />
          <Route path="feedback-master" 
            element={<AdminOnly><FeedbackMasterPage /></AdminOnly>} />
          <Route path="grievances"
            element={<AdminOnly><GrievanceMasterPage /></AdminOnly>} />
          <Route path="messaging"
            element={<AdminOnly><MessagingPage /></AdminOnly>} />
          <Route path="mock-interviews"
            element={<AdminOnly><MockInterviewManager /></AdminOnly>} />
          <Route path="ai-tutor"
            element={<AdminOnly><ComingSoon title="AI Chat Tutor" icon="🤖" /></AdminOnly>} />
          <Route path="activity-logs"
            element={<SuperAdminOnly><AnalyticsDashboardPage /></SuperAdminOnly>} />
        </Route>

        {/* Invoice view — outside portal layout so it prints cleanly */}
        <Route path="/invoice/:id"
          element={<ProtectedRoute><InvoiceViewPage /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </AppErrorBoundary>
    </Suspense>
  );
}

function ComingSoon({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center text-3xl shadow-xl">
        {icon}
      </div>
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <p className="text-slate-500 text-sm">This module is coming soon.</p>
    </div>
  );
}
