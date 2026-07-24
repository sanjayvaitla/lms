import {
  Table, Column, Model, DataType,
  BelongsTo, ForeignKey, Default, AllowNull,
} from 'sequelize-typescript';
import { Assessment } from './Assessment';
import { User } from './User';

@Table({ tableName: 'assessment_submissions', timestamps: false })
export class AssessmentSubmission extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Assessment)
  @Column({ field: 'assessment_id', type: DataType.UUID })
  declare assessmentId: string;

  @ForeignKey(() => User)
  @Column({ field: 'student_id', type: DataType.UUID })
  declare studentId: string;

  @AllowNull(true)
  @Column({ field: 'pdf_key', type: DataType.TEXT })
  declare pdfKey: string | null;

  @Default(DataType.NOW)
  @Column({ field: 'submitted_at', type: DataType.DATE })
  declare submittedAt: Date;

  // Part A: MCQ score (manually entered by admin)
  @AllowNull(true)
  @Column({ field: 'part_a_score', type: DataType.DECIMAL })
  declare partAScore: number | null;

  // Part B breakdown scores (manually entered by admin)
  @AllowNull(true)
  @Column({ field: 'approach_score', type: DataType.DECIMAL })
  declare approachScore: number | null;

  @AllowNull(true)
  @Column({ field: 'viva_score', type: DataType.DECIMAL })
  declare vivaScore: number | null;

  @AllowNull(true)
  @Column({ field: 'solution_score', type: DataType.DECIMAL })
  declare solutionScore: number | null;

  @AllowNull(true)
  @Column({ field: 'graded_at', type: DataType.DATE })
  declare gradedAt: Date | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare feedback: string | null;

  @AllowNull(true)
  @Column({ field: 'ai_approach_score', type: DataType.DECIMAL })
  declare aiApproachScore: number | null;

  @AllowNull(true)
  @Column({ field: 'ai_solution_score', type: DataType.DECIMAL })
  declare aiSolutionScore: number | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare aiFeedback: string | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare aiStatus: 'PENDING' | 'COMPLETED' | 'FAILED' | null;

  @Default('SUBMITTED')
  @Column(DataType.TEXT)
  declare status: 'SUBMITTED' | 'GRADED';

  @BelongsTo(() => Assessment, { foreignKey: 'assessment_id' })
  declare assessment: Assessment;

  @BelongsTo(() => User, { foreignKey: 'student_id' })
  declare student: User;
}
