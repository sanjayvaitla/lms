/**
 * models/index.ts — Register all Sequelize models and export them.
 *
 * Imported once in src/index.ts. Calls sequelize.addModels() explicitly
 * so we use named exports (not default exports) without directory scanning.
 */

import sequelize from '../lib/sequelize';

export { User }                 from './User';
export { Course }               from './Course';
export { Batch }                from './Batch';
export { Enrollment }           from './Enrollment';
export { RefreshToken }         from './RefreshToken';
export { OtpVerification }      from './OtpVerification';
export { TrainerProfile }       from './TrainerProfile';
export { CourseSyllabus }       from './CourseSyllabus';
export { BatchSyllabus }        from './BatchSyllabus';
export { CourseModule }         from './CourseModule';
export { QuizQuestion }         from './QuizQuestion';
export { Quiz }                 from './Quiz';
export { QuizAttempt }          from './QuizAttempt';
export { QuizAttemptAnswer }    from './QuizAttemptAnswer';
export { Assignment }           from './Assignment';
export { AssignmentBatch }      from './AssignmentBatch';
export { AssignmentSubmission } from './AssignmentSubmission';
export { Assessment }           from './Assessment';
export { AssessmentBatch }      from './AssessmentBatch';
export { AssessmentSubmission } from './AssessmentSubmission';
export { Message }              from './Message';
export { PasswordResetToken }   from './PasswordResetToken';
export { AttendanceSession }    from './AttendanceSession';
export { AttendanceRecord }     from './AttendanceRecord';
export { LiveClassLink }        from './LiveClassLink';
export { WhatsAppMessage }      from './WhatsAppMessage';

export { MockInterview }        from './MockInterview';
export { BatchSessionFeedbackConfig } from './BatchSessionFeedbackConfig';
export { SessionFeedback }      from './SessionFeedback';
export { PlacementJob }         from './PlacementJob';
export { PlacementMaterial }    from './PlacementMaterial';
export { StudentResume }        from './StudentResume';
export { PlacementMatch }        from './PlacementMatch';
export { JobApplication }       from './JobApplication';
export { Grievance }            from './Grievance';
export { ActivityLog }          from './ActivityLog';
export { DailyAnalytics }       from './DailyAnalytics';
import { User }                 from './User';
import { Course }               from './Course';
import { Batch }                from './Batch';
import { Enrollment }           from './Enrollment';
import { RefreshToken }         from './RefreshToken';
import { OtpVerification }      from './OtpVerification';
import { TrainerProfile }       from './TrainerProfile';
import { CourseSyllabus }       from './CourseSyllabus';
import { BatchSyllabus }        from './BatchSyllabus';
import { CourseModule }         from './CourseModule';
import { QuizQuestion }         from './QuizQuestion';
import { Quiz }                 from './Quiz';
import { QuizAttempt }          from './QuizAttempt';
import { QuizAttemptAnswer }    from './QuizAttemptAnswer';
import { Assignment }           from './Assignment';
import { AssignmentBatch }      from './AssignmentBatch';
import { AssignmentSubmission } from './AssignmentSubmission';
import { Assessment }           from './Assessment';
import { AssessmentBatch }      from './AssessmentBatch';
import { AssessmentSubmission } from './AssessmentSubmission';
import { Message }              from './Message';
import { PasswordResetToken }   from './PasswordResetToken';
import { AttendanceSession }    from './AttendanceSession';
import { AttendanceRecord }     from './AttendanceRecord';
import { LiveClassLink }        from './LiveClassLink';
import { WhatsAppMessage }      from './WhatsAppMessage';

import { MockInterview }        from './MockInterview';
import { BatchSessionFeedbackConfig } from './BatchSessionFeedbackConfig';
import { SessionFeedback }      from './SessionFeedback';
import { PlacementJob }         from './PlacementJob';
import { PlacementMaterial }    from './PlacementMaterial';
import { StudentResume }        from './StudentResume';
import { PlacementMatch }        from './PlacementMatch';
import { JobApplication }       from './JobApplication';
import { Grievance }            from './Grievance';
import { CourseFeedback }       from './CourseFeedback';
import { ProgramFeedback }      from './ProgramFeedback';
import { ActivityLog }          from './ActivityLog';
import { DailyAnalytics }       from './DailyAnalytics';

sequelize.addModels([
  User,
  Course,
  Batch,
  Enrollment,
  RefreshToken,
  OtpVerification,
  TrainerProfile,
  CourseSyllabus,
  BatchSyllabus,
  CourseModule,
  QuizQuestion,
  Quiz,
  QuizAttempt,
  QuizAttemptAnswer,
  Assignment,
  AssignmentBatch,
  AssignmentSubmission,
  Assessment,
  AssessmentBatch,
  AssessmentSubmission,
  Message,
  PasswordResetToken,
  AttendanceSession,
  AttendanceRecord,
  LiveClassLink,
  WhatsAppMessage,
  MockInterview,
  PlacementJob,
  PlacementMaterial,
  StudentResume,
  PlacementMatch,
  JobApplication,
  BatchSessionFeedbackConfig,
  SessionFeedback,
  Grievance,
  CourseFeedback,
  ProgramFeedback,
  ActivityLog,
  DailyAnalytics
]);

export * from './CourseFeedback';
export * from './ProgramFeedback';
