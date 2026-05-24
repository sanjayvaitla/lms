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
export { Message }              from './Message';
export { PasswordResetToken }   from './PasswordResetToken';

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
import { Message }              from './Message';
import { PasswordResetToken }   from './PasswordResetToken';

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
  Message,
  PasswordResetToken,
]);
