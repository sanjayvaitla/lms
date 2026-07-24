import React from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type InternshipStatus = 'ACTIVE' | 'INACTIVE' | 'COMPLETED' | 'DRAFT';
export type InternshipType = 'Virtual' | 'Offline' | 'Hybrid';
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type PaymentStatus = 'PAID' | 'PENDING' | 'PROCESSING';
export type PPOStatus = 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'PENDING';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE';

export interface Internship {
  id: string; title: string; type: InternshipType; category: string;
  domain: string; duration: string; startDate: string; endDate: string;
  stipend: number; status: InternshipStatus; description: string;
  eligibility: string; maxSeats: number; industryPartner: string;
  certificateApplicable: boolean; ppoApplicable: boolean;
}

export interface Company {
  id: string; name: string; industryType: string; contactPerson: string;
  contactEmail: string; contactNumber: string; website: string;
  location: string; domains: string; isActive: boolean;
  status: 'APPROVED' | 'PENDING' | 'BLOCKED';
}

export interface InternBatch {
  id: string; name: string; internshipId: string; internshipTitle: string;
  startDate: string; endDate: string; mentor: string;
  studentCount: number; status: 'ACTIVE' | 'COMPLETED' | 'UPCOMING';
}

export interface StudentAllocation {
  id: string; studentName: string; internshipTitle: string; company: string;
  mentor: string; joiningDate: string; completionDate: string;
  status: 'ACTIVE' | 'COMPLETED' | 'DROPPED'; progress: number;
}

export interface Task {
  id: string; taskName: string; taskType: 'Assignment' | 'Project' | 'Presentation';
  assignedTo: string; assignedDate: string; dueDate: string; priority: Priority;
  assignedBy: string; submissionRequired: boolean; status: TaskStatus;
}

export interface WorkLog {
  id: string; studentName: string; date: string; workDone: string;
  hoursWorked: number; challenges: string; mentorComments: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface Evaluation {
  id: string; studentName: string; company: string; attendance: number;
  technical: number; communication: number; problemSolving: number;
  teamwork: number; projectCompletion: number; total: number; rating: string;
}

export interface Stipend {
  id: string; studentName: string; company: string; month?: string;
  amount: number; paymentDate: string; status: PaymentStatus;
}

export interface PPO {
  id: string; studentId: string; studentName: string; company: string; internshipRating: number;
  ppoOffered: boolean; ppoDate: string; packageOffered: string; status: PPOStatus;
}

export interface AttendanceRecord {
  id: string; studentName: string; date: string;
  status: AttendanceStatus; remarks: string;
}

export interface Milestone { id: string; title: string; done: boolean; }

// ── GitHub Workflow Types ─────────────────────────────────────────────────────
export type GitHubPipelineStatus = 'NOT_STARTED' | 'FORKED' | 'CODING' | 'SUBMITTED' | 'AI_GRADED';

export interface GHResource {
  id: string; title: string; type: 'pdf' | 'video' | 'docs' | 'other'; url: string;
}
export interface GHTaskFile { name: string; type: 'pdf' | 'zip'; }

export interface RefItem {
  type: 'pdf' | 'video' | 'website' | 'ppt';
  url: string;
  label: string;
}

export interface AdminReference {
  id: string; refNo: number; title: string;
  items: RefItem[];
  description: string; linkedBatch: string;
}

export interface SprintTask {
  id: string; sprintNo: number; title: string; description: string;
  templateRepoUrl: string; dueDate: string;
  resources: GHResource[]; taskFiles: GHTaskFile[];
  artifactType: string; projectPdfName: string;
}

export interface StudentGitHubProgress {
  id: string; studentId?: string; studentName: string; taskId: string;
  status: GitHubPipelineStatus; forkUrl: string;
  lastPushAt: string; commitCount: number;
  aiScore: number | null;
  aiBreakdown: { label: string; score: number; max: number }[];
  submittedAt: string; attendanceAutoMarked: boolean;
}

export interface WebhookEvent {
  id: string;
  studentId?: string | null;
  studentName?: string | null;
  pusherLogin: string;
  repoName: string;
  repoOwner?: string;
  ref?: string;
  headSha?: string;
  commitMessage: string;
  status: string;
  errorMessage?: string | null;
  source?: 'webhook' | 'poller' | 'admin-scan';
  timestamp: string;
  attendanceMarked: boolean;
}

export interface InternProject {
  id: string; title: string; studentName: string; company: string;
  description: string; startDate: string; dueDate: string;
  progress: number; githubLink: string; demoLink: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
  milestones: Milestone[]; deliverableSubmitted: boolean;
}

export interface Certificate {
  id: string; studentName: string; company: string; internshipTitle: string;
  grade: string; issueDate: string; status: 'PENDING' | 'GENERATED' | 'ISSUED';
  certificateId: string; attendancePct: number; projectSubmitted: boolean; evaluationDone: boolean;
}

// ── Mock Data ──────────────────────────────────────────────────────────────────

export const INIT_INTERNSHIPS: Internship[] = [
  {
    id: 'INT001', title: 'Full Stack Development Internship', type: 'Hybrid', category: 'IT',
    domain: 'Web Development', duration: '12 Weeks', startDate: '2026-07-01', endDate: '2026-09-24',
    stipend: 8000, status: 'ACTIVE', description: 'Build real-world web applications using React and Node.js.',
    eligibility: 'React, Node.js basics', maxSeats: 20, industryPartner: 'TechCorp Pvt Ltd',
    certificateApplicable: true, ppoApplicable: true,
  },
  {
    id: 'INT002', title: 'Data Science Internship', type: 'Virtual', category: 'IT',
    domain: 'Data Science', duration: '8 Weeks', startDate: '2026-07-15', endDate: '2026-09-09',
    stipend: 6000, status: 'ACTIVE', description: 'Work on ML models and data pipelines.',
    eligibility: 'Python, Statistics', maxSeats: 15, industryPartner: 'DataVision Analytics',
    certificateApplicable: true, ppoApplicable: false,
  },
];

export const INIT_BATCHES: InternBatch[] = [
  {
    id: 'IBAT001', name: 'FullStack Intern June 2026', internshipId: 'INT001',
    internshipTitle: 'Full Stack Development Internship', startDate: '2026-07-01',
    endDate: '2026-09-24', mentor: 'Suresh Mehta', studentCount: 12, status: 'ACTIVE',
  },
  {
    id: 'IBAT002', name: 'DS Intern July 2026', internshipId: 'INT002',
    internshipTitle: 'Data Science Internship', startDate: '2026-07-15',
    endDate: '2026-09-09', mentor: 'Anita Desai', studentCount: 8, status: 'UPCOMING',
  },
];

export const INIT_ALLOCATIONS: StudentAllocation[] = [
  { id: 'A001', studentName: 'Ravi Kumar', internshipTitle: 'Full Stack Development Internship', company: 'TechCorp Pvt Ltd', mentor: 'Suresh Mehta', joiningDate: '2026-07-01', completionDate: '2026-09-24', status: 'ACTIVE', progress: 45 },
  { id: 'A002', studentName: 'Pooja Singh', internshipTitle: 'Data Science Internship', company: 'DataVision Analytics', mentor: 'Anita Desai', joiningDate: '2026-07-15', completionDate: '2026-09-09', status: 'ACTIVE', progress: 20 },
  { id: 'A003', studentName: 'Deepak Rao', internshipTitle: 'Full Stack Development Internship', company: 'TechCorp Pvt Ltd', mentor: 'Suresh Mehta', joiningDate: '2026-07-01', completionDate: '2026-09-24', status: 'DROPPED', progress: 30 },
];

export const INIT_SPRINT_TASKS: SprintTask[] = [
  {
    id: 'ST001', sprintNo: 1, title: 'User Authentication Module',
    description: 'Implement JWT-based login, registration, and password reset. Use the provided template as the starting point.',
    templateRepoUrl: 'https://github.com/vtricks-org/auth-module-template',
    dueDate: '2026-07-12', artifactType: 'Node.js', projectPdfName: 'sprint-1-auth-module-guide.pdf',
    resources: [
      { id: 'r1', title: 'JWT Authentication Deep Dive', type: 'pdf', url: '#' },
      { id: 'r2', title: 'Node.js Auth Tutorial – YouTube', type: 'video', url: '#' },
      { id: 'r3', title: 'Passport.js Official Docs', type: 'docs', url: 'https://www.passportjs.org/docs' },
      { id: 'r4', title: 'bcrypt Security Notes', type: 'other', url: '#' },
    ],
    taskFiles: [{ name: 'auth_requirements.pdf', type: 'pdf' }, { name: 'test_cases.zip', type: 'zip' }],
  },
  {
    id: 'ST002', sprintNo: 2, title: 'Admin Dashboard with Analytics',
    description: 'Build an analytics dashboard with charts, KPI cards, and live data from REST APIs.',
    templateRepoUrl: 'https://github.com/vtricks-org/dashboard-template',
    dueDate: '2026-07-25', artifactType: 'React', projectPdfName: 'sprint-2-dashboard-guide.pdf',
    resources: [
      { id: 'r5', title: 'Recharts Official Documentation', type: 'docs', url: 'https://recharts.org' },
      { id: 'r6', title: 'Dashboard Design Patterns PDF', type: 'pdf', url: '#' },
      { id: 'r7', title: 'TanStack React Query Crash Course', type: 'video', url: '#' },
    ],
    taskFiles: [{ name: 'dashboard_spec.pdf', type: 'pdf' }],
  },
  {
    id: 'ST003', sprintNo: 3, title: 'REST API Integration & Testing',
    description: 'Integrate 3rd-party APIs, write unit tests with Jest, and document endpoints using Swagger.',
    templateRepoUrl: 'https://github.com/vtricks-org/api-integration-template',
    dueDate: '2026-08-08', artifactType: 'Node.js', projectPdfName: 'sprint-3-api-testing-guide.pdf',
    resources: [
      { id: 'r8', title: 'Swagger OpenAPI 3.0 Guide', type: 'docs', url: 'https://swagger.io/docs' },
      { id: 'r9', title: 'Jest Unit Testing Patterns', type: 'pdf', url: '#' },
      { id: 'r10', title: 'API Integration Best Practices', type: 'video', url: '#' },
    ],
    taskFiles: [{ name: 'api_requirements.pdf', type: 'pdf' }, { name: 'postman_collection.zip', type: 'zip' }],
  },
  {
    id: 'ST004', sprintNo: 4, title: 'Real-time Chat with WebSockets',
    description: 'Build a real-time group chat feature using Socket.io. Deploy the server to Railway or Render.',
    templateRepoUrl: 'https://github.com/vtricks-org/realtime-chat-template',
    dueDate: '2026-08-22', artifactType: 'Node.js', projectPdfName: 'sprint-4-chat-guide.pdf',
    resources: [
      { id: 'r11', title: 'Socket.io Official Docs', type: 'docs', url: 'https://socket.io/docs/v4' },
      { id: 'r12', title: 'WebSocket Architecture Explained', type: 'pdf', url: '#' },
      { id: 'r13', title: 'Deploy Node.js to Railway – Tutorial', type: 'video', url: '#' },
    ],
    taskFiles: [{ name: 'chat_requirements.pdf', type: 'pdf' }],
  },
  {
    id: 'ST005', sprintNo: 5, title: 'File Upload & Cloud Storage',
    description: 'Implement file upload to AWS S3 or Cloudinary. Support images, PDFs, and videos up to 50 MB.',
    templateRepoUrl: 'https://github.com/vtricks-org/file-upload-template',
    dueDate: '2026-09-05', artifactType: 'Node.js', projectPdfName: 'sprint-5-upload-guide.pdf',
    resources: [
      { id: 'r14', title: 'AWS S3 SDK v3 Guide', type: 'docs', url: 'https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide' },
      { id: 'r15', title: 'Multer File Upload Tutorial', type: 'video', url: '#' },
    ],
    taskFiles: [{ name: 'upload_spec.pdf', type: 'pdf' }, { name: 'sample_files.zip', type: 'zip' }],
  },
];

export const INIT_GITHUB_PROGRESS: StudentGitHubProgress[] = [
  {
    id: 'GP001', studentName: 'Ravi Kumar', taskId: 'ST001', status: 'AI_GRADED',
    forkUrl: 'https://github.com/ravi-kumar-dev/auth-module-template',
    lastPushAt: '2026-07-10 14:32', commitCount: 8, aiScore: 4.4,
    aiBreakdown: [
      { label: 'Code Quality',  score: 4, max: 5 },
      { label: 'Functionality', score: 5, max: 5 },
      { label: 'Test Coverage', score: 4, max: 5 },
      { label: 'Documentation', score: 4, max: 5 },
      { label: 'Best Practices', score: 5, max: 5 },
    ],
    submittedAt: '2026-07-10 15:00', attendanceAutoMarked: true,
  },
  {
    id: 'GP002', studentName: 'Pooja Singh', taskId: 'ST001', status: 'SUBMITTED',
    forkUrl: 'https://github.com/pooja-singh-ml/auth-module-template',
    lastPushAt: '2026-07-11 10:15', commitCount: 5, aiScore: null,
    aiBreakdown: [], submittedAt: '2026-07-11 10:30', attendanceAutoMarked: true,
  },
  {
    id: 'GP003', studentName: 'Anjali Mehta', taskId: 'ST001', status: 'CODING',
    forkUrl: 'https://github.com/anjali-mehta/auth-module-template',
    lastPushAt: '2026-07-11 16:45', commitCount: 3, aiScore: null,
    aiBreakdown: [], submittedAt: '', attendanceAutoMarked: true,
  },
  {
    id: 'GP004', studentName: 'Rohan Patel', taskId: 'ST001', status: 'FORKED',
    forkUrl: 'https://github.com/rohan-patel/auth-module-template',
    lastPushAt: '', commitCount: 0, aiScore: null,
    aiBreakdown: [], submittedAt: '', attendanceAutoMarked: false,
  },
  {
    id: 'GP005', studentName: 'Deepak Rao', taskId: 'ST001', status: 'NOT_STARTED',
    forkUrl: '', lastPushAt: '', commitCount: 0, aiScore: null,
    aiBreakdown: [], submittedAt: '', attendanceAutoMarked: false,
  },
  {
    id: 'GP006', studentName: 'Ravi Kumar', taskId: 'ST002', status: 'CODING',
    forkUrl: 'https://github.com/ravi-kumar-dev/dashboard-template',
    lastPushAt: '2026-07-22 11:00', commitCount: 4, aiScore: null,
    aiBreakdown: [], submittedAt: '', attendanceAutoMarked: true,
  },
  {
    id: 'GP007', studentName: 'Pooja Singh', taskId: 'ST002', status: 'NOT_STARTED',
    forkUrl: '', lastPushAt: '', commitCount: 0, aiScore: null,
    aiBreakdown: [], submittedAt: '', attendanceAutoMarked: false,
  },
  {
    id: 'GP008', studentName: 'Anjali Mehta', taskId: 'ST002', status: 'FORKED',
    forkUrl: 'https://github.com/anjali-mehta/dashboard-template',
    lastPushAt: '', commitCount: 0, aiScore: null,
    aiBreakdown: [], submittedAt: '', attendanceAutoMarked: false,
  },
];

export const INIT_WEBHOOK_EVENTS: WebhookEvent[] = [
  { id: 'WH001', studentName: 'Ravi Kumar', repoName: 'auth-module-template', repoOwner: 'ravi-kumar-dev', commitMessage: 'feat: implement JWT access & refresh tokens', timestamp: '2026-07-10 14:32', ref: 'refs/heads/main', status: 'SUCCESS', attendanceMarked: true, pusherLogin: 'ravi-kumar-dev' },
  { id: 'WH002', studentName: 'Ravi Kumar', repoName: 'auth-module-template', repoOwner: 'ravi-kumar-dev', commitMessage: 'fix: bcrypt hash rounds increased to 12', timestamp: '2026-07-10 12:10', ref: 'refs/heads/main', status: 'SUCCESS', attendanceMarked: true, pusherLogin: 'ravi-kumar-dev' },
  { id: 'WH003', studentName: 'Anjali Mehta', repoName: 'auth-module-template', repoOwner: 'anjali-mehta', commitMessage: 'feat: Google OAuth 2.0 integration', timestamp: '2026-07-11 16:45', ref: 'refs/heads/main', status: 'SUCCESS', attendanceMarked: true, pusherLogin: 'anjali-mehta' },
  { id: 'WH004', studentName: 'Pooja Singh', repoName: 'auth-module-template', repoOwner: 'pooja-singh-dev', commitMessage: 'feat: password reset via email OTP', timestamp: '2026-07-11 10:15', ref: 'refs/heads/main', status: 'SUCCESS', attendanceMarked: true, pusherLogin: 'pooja-singh-dev' },
  { id: 'WH005', studentName: 'Ravi Kumar', repoName: 'dashboard-template', repoOwner: 'ravi-kumar-dev', commitMessage: 'feat: bar chart for monthly sales analytics', timestamp: '2026-07-22 11:00', ref: 'refs/heads/main', status: 'SUCCESS', attendanceMarked: true, pusherLogin: 'ravi-kumar-dev' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

export function statusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    INACTIVE: 'bg-gray-100 text-gray-500 border-gray-200',
    COMPLETED: 'bg-blue-100 text-blue-700 border-blue-200',
    DRAFT: 'bg-amber-100 text-amber-700 border-amber-200',
    UPCOMING: 'bg-purple-100 text-purple-700 border-purple-200',
    APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
    BLOCKED: 'bg-red-100 text-red-700 border-red-200',
    HIGH: 'bg-red-100 text-red-700 border-red-200',
    MEDIUM: 'bg-amber-100 text-amber-700 border-amber-200',
    LOW: 'bg-green-100 text-green-700 border-green-200',
    PAID: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    PROCESSING: 'bg-blue-100 text-blue-700 border-blue-200',
    DROPPED: 'bg-red-100 text-red-700 border-red-200',
    OFFERED: 'bg-purple-100 text-purple-700 border-purple-200',
    ACCEPTED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    DECLINED: 'bg-red-100 text-red-700 border-red-200',
    SUBMITTED: 'bg-blue-100 text-blue-700 border-blue-200',
    IN_PROGRESS: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    REJECTED: 'bg-red-100 text-red-700 border-red-200',
    GENERATED: 'bg-blue-100 text-blue-700 border-blue-200',
    ISSUED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    NOT_STARTED: 'bg-gray-100 text-gray-500 border-gray-200',
    OVERDUE: 'bg-red-100 text-red-700 border-red-200',
    PRESENT: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    ABSENT: 'bg-red-100 text-red-700 border-red-200',
    HALF_DAY: 'bg-amber-100 text-amber-700 border-amber-200',
    LEAVE: 'bg-purple-100 text-purple-700 border-purple-200',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${map[status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function ratingColor(rating: string) {
  if (rating === 'Excellent') return 'text-purple-700';
  if (rating === 'Very Good') return 'text-blue-700';
  if (rating === 'Good') return 'text-emerald-700';
  if (rating === 'Average') return 'text-amber-700';
  return 'text-red-700';
}

export function calcRating(total: number): string {
  if (total >= 90) return 'Excellent';
  if (total >= 75) return 'Very Good';
  if (total >= 60) return 'Good';
  if (total >= 40) return 'Average';
  return 'Needs Improvement';
}

export function validateGithubUsername(username: string): string | null {
  if (!username) return 'GitHub username is required';
  if (username.length > 39) return 'GitHub username must be 39 characters or less';
  const regex = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
  if (!regex.test(username)) {
    return 'GitHub username must be alphanumeric or contain single hyphens, and cannot start or end with a hyphen';
  }
  return null;
}

export function getWebhookStatusBadge(status: string) {
  switch (status) {
    case 'SUCCESS':
      return <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold border border-emerald-200">SUCCESS</span>;
    case 'STUDENT_NOT_FOUND':
      return <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold border border-amber-200" title="Pusher login doesn't match any student's github_username">UNLINKED USER</span>;
    case 'PROGRESS_NOT_FOUND':
      return <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold border border-amber-200" title="Student has not started task or fork URL doesn't match">NO PROGRESS ROW</span>;
    case 'ERROR':
    default:
      return <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold border border-red-200">ERROR</span>;
  }
}

export const INPUT_CLS = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400';
export const LABEL_CLS = 'text-xs font-semibold text-gray-600 mb-1.5 block';

import { AlertCircle } from 'lucide-react';

export function TabError({ msg }: { msg?: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center text-red-700">
      <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
      <p className="text-sm font-semibold">Failed to load data</p>
      <p className="text-xs text-red-500 mt-1">{msg ?? 'Refresh the page. If this persists, check that the backend server is running.'}</p>
    </div>
  );
}
