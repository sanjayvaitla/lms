import { Routes, Route, Navigate } from 'react-router';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import LoginPage from './pages/Login';
import SignupPage from './pages/Signup';
import ForgotPasswordPage from './pages/ForgotPassword';
import ResetPasswordPage from './pages/ResetPassword';
import DashboardPage from './pages/Dashboard';
import CourseMasterPage from './pages/CourseMaster';
import BatchMasterPage from './pages/BatchMaster';
import CourseAnalyticsPage from './pages/CourseAnalytics';
import TrainerMasterPage from './pages/TrainerMaster';
import AssignmentMasterPage from './pages/AssignmentMaster';
import QuizMasterPage from './pages/QuizMaster';
import LearnerMasterPage from './pages/LearnerMaster';

export default function App() {
  return (
    <Routes>
      <Route path="/login"            element={<LoginPage />} />
      <Route path="/signup"           element={<SignupPage />} />
      <Route path="/forgot-password"  element={<ForgotPasswordPage />} />
      <Route path="/reset-password"   element={<ResetPasswordPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"   element={<DashboardPage />} />
        <Route path="courses"     element={<CourseMasterPage />} />
        <Route path="batches"     element={<BatchMasterPage />} />
        <Route path="courses/:id/analytics" element={<CourseAnalyticsPage />} />
        <Route path="trainers"    element={<TrainerMasterPage />} />
        <Route path="assignments" element={<AssignmentMasterPage />} />
        <Route path="quizzes"     element={<QuizMasterPage />} />
        <Route path="learners"    element={<LearnerMasterPage />} />
        <Route path="projects"    element={<ComingSoon title="Project Master" icon="🗂️" />} />
        <Route path="placements"  element={<ComingSoon title="Placement Master" icon="💼" />} />
        <Route path="attendance"  element={<ComingSoon title="Attendance Master" icon="📅" />} />
        <Route path="fees"        element={<ComingSoon title="Fees Module" icon="💰" />} />
        <Route path="messaging"   element={<ComingSoon title="Messaging" icon="💬" />} />
        <Route path="ai-tutor"    element={<ComingSoon title="AI Chat Tutor" icon="🤖" />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function ComingSoon({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center text-3xl shadow-xl">
        {icon}
      </div>
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <p className="text-gray-400 text-sm">This module is coming soon.</p>
    </div>
  );
}
