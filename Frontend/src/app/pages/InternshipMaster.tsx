import React, { Suspense, lazy, useState } from 'react';
import {
  Briefcase, Building2, Users, FileText, Award, DollarSign,
  Activity, GitBranch, GitPullRequest, Star, TrendingUp, UserCheck, BookOpen, LayoutDashboard
} from 'lucide-react';

const DashboardTab = lazy(() =>
  import('./internship-master/tabs/DashboardTab').then((m) => ({ default: m.DashboardTab })),
);
const ProgramsTab = lazy(() =>
  import('./internship-master/tabs/ProgramsTab').then((m) => ({ default: m.ProgramsTab })),
);
const ReferencesTab = lazy(() =>
  import('./internship-master/tabs/ReferencesTab').then((m) => ({ default: m.ReferencesTab })),
);
const BatchesTab = lazy(() =>
  import('./internship-master/tabs/BatchesTab').then((m) => ({ default: m.BatchesTab })),
);
const CompaniesTab = lazy(() =>
  import('./internship-master/tabs/CompaniesTab').then((m) => ({ default: m.CompaniesTab })),
);
const StudentsTab = lazy(() =>
  import('./internship-master/tabs/StudentsTab').then((m) => ({ default: m.StudentsTab })),
);
const TasksGitTab = lazy(() =>
  import('./internship-master/tabs/TasksGitTab').then((m) => ({ default: m.TasksGitTab })),
);
const WorkLogsTab = lazy(() =>
  import('./internship-master/tabs/WorkLogsTab').then((m) => ({ default: m.WorkLogsTab })),
);
const AttendanceTab = lazy(() =>
  import('./internship-master/tabs/AttendanceTab').then((m) => ({ default: m.AttendanceTab })),
);
const ProjectsTab = lazy(() =>
  import('./internship-master/tabs/ProjectsTab').then((m) => ({ default: m.ProjectsTab })),
);
const EvaluationTab = lazy(() =>
  import('./internship-master/tabs/EvaluationTab').then((m) => ({ default: m.EvaluationTab })),
);
const StipendTab = lazy(() =>
  import('./internship-master/tabs/StipendTab').then((m) => ({ default: m.StipendTab })),
);
const PPOTab = lazy(() =>
  import('./internship-master/tabs/PPOTab').then((m) => ({ default: m.PPOTab })),
);
const CertificatesTab = lazy(() =>
  import('./internship-master/tabs/CertificatesTab').then((m) => ({ default: m.CertificatesTab })),
);

const TABS = [
  { key: 'dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
  { key: 'programs',     label: 'Programs',     icon: Briefcase },
  { key: 'references',   label: 'References',   icon: BookOpen },
  { key: 'batches',      label: 'Batches',      icon: Users },
  { key: 'companies',    label: 'Companies',    icon: Building2 },
  { key: 'students',     label: 'Students',     icon: UserCheck },
  { key: 'tasks_git',    label: 'Tasks (Git)',  icon: GitPullRequest },
  { key: 'worklogs',     label: 'Work Logs',    icon: FileText },
  { key: 'attendance',   label: 'Attendance',   icon: Activity },
  { key: 'projects',     label: 'Projects',     icon: GitBranch },
  { key: 'evaluation',   label: 'Evaluations',  icon: Star },
  { key: 'stipend',      label: 'Stipends',     icon: DollarSign },
  { key: 'ppo',          label: 'PPO',          icon: TrendingUp },
  { key: 'certificates', label: 'Certificates', icon: Award },
] as const;

type TabKey = typeof TABS[number]['key'];

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-gray-400">
      Loading tab…
    </div>
  );
}

export default function InternshipMasterPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

  function renderTab() {
    switch (activeTab) {
      case 'dashboard':    return <DashboardTab />;
      case 'programs':     return <ProgramsTab />;
      case 'references':   return <ReferencesTab />;
      case 'batches':      return <BatchesTab />;
      case 'companies':    return <CompaniesTab />;
      case 'students':     return <StudentsTab />;
      case 'tasks_git':    return <TasksGitTab />;
      case 'worklogs':     return <WorkLogsTab />;
      case 'attendance':   return <AttendanceTab />;
      case 'projects':     return <ProjectsTab />;
      case 'evaluation':   return <EvaluationTab />;
      case 'stipend':      return <StipendTab />;
      case 'ppo':          return <PPOTab />;
      case 'certificates': return <CertificatesTab />;
      default:             return <DashboardTab />;
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Internship Master</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage internship programs, companies, students &amp; evaluations</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-md">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                isActive
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <Suspense fallback={<TabFallback />}>
        {renderTab()}
      </Suspense>
    </div>
  );
}
