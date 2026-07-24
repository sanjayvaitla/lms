import {
  Table, Column, Model, DataType,
  BelongsTo, HasMany, BelongsToMany, ForeignKey, Default, AllowNull,
} from 'sequelize-typescript';
import { Course } from './Course';
import { User } from './User';
import { Batch } from './Batch';
import { AssessmentBatch } from './AssessmentBatch';
import type { AssessmentSubmission } from './AssessmentSubmission';

@Table({ tableName: 'assessments', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' })
export class Assessment extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Course)
  @Column({ field: 'course_id', type: DataType.UUID })
  declare courseId: string;

  @Column(DataType.TEXT)
  declare title: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare description: string | null;

  @Column({ field: 'pdf_filename', type: DataType.TEXT })
  declare pdfFilename: string;

  @Column({ field: 'pdf_path', type: DataType.TEXT })
  declare pdfPath: string;

  @Default(0)
  @Column({ field: 'pdf_size_bytes', type: DataType.INTEGER })
  declare pdfSizeBytes: number;

  @AllowNull(true)
  @Column({ field: 'due_date', type: DataType.DATE })
  declare dueDate: Date | null;

  // Total marks (default 100)
  @Default(100)
  @Column({ field: 'total_marks', type: DataType.INTEGER })
  declare totalMarks: number;

  // Part A: MCQ section — 25% of total
  @Default(25)
  @Column({ field: 'part_a_marks', type: DataType.INTEGER })
  declare partAMarks: number;

  // Part B: PDF submission — 75% of total
  @Default(75)
  @Column({ field: 'part_b_marks', type: DataType.INTEGER })
  declare partBMarks: number;

  // Part B sub-weights (percentages of part B)
  @Default(40)
  @Column({ field: 'part_b_approach_pct', type: DataType.INTEGER })
  declare partBApproachPct: number;

  @Default(25)
  @Column({ field: 'part_b_viva_pct', type: DataType.INTEGER })
  declare partBVivaPct: number;

  // solution pct = 100 - approach_pct - viva_pct (implicitly 35)

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare aiRubric: string | null;

  @Default('DRAFT')
  @Column(DataType.TEXT)
  declare status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';

  @AllowNull(true)
  @ForeignKey(() => User)
  @Column({ field: 'created_by', type: DataType.UUID })
  declare createdBy: string | null;

  @BelongsTo(() => Course, { foreignKey: 'course_id' })
  declare course: Course;

  @BelongsTo(() => User, { foreignKey: 'created_by' })
  declare creator: User;

  @BelongsToMany(() => Batch, () => AssessmentBatch)
  declare batches: Batch[];

  @HasMany(() => require('./AssessmentSubmission').AssessmentSubmission, { foreignKey: 'assessment_id' })
  declare submissions: AssessmentSubmission[];
}
