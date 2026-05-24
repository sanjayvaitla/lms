import {
  Table, Column, Model, DataType,
  BelongsTo, HasMany, BelongsToMany, ForeignKey, Default, AllowNull,
} from 'sequelize-typescript';
import { Course } from './Course';
import { CourseModule } from './CourseModule';
import { User } from './User';
import { Batch } from './Batch';
import { AssignmentBatch } from './AssignmentBatch';
import type { AssignmentSubmission } from './AssignmentSubmission';

@Table({ tableName: 'assignments', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' })
export class Assignment extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Course)
  @Column({ field: 'course_id', type: DataType.UUID })
  declare courseId: string;

  @AllowNull(true)
  @ForeignKey(() => CourseModule)
  @Column({ field: 'module_id', type: DataType.UUID })
  declare moduleId: string | null;

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

  @Default(100)
  @Column({ field: 'max_score', type: DataType.INTEGER })
  declare maxScore: number;

  @Default('DRAFT')
  @Column(DataType.TEXT)
  declare status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @AllowNull(true)
  @ForeignKey(() => User)
  @Column({ field: 'created_by', type: DataType.UUID })
  declare createdBy: string | null;

  @BelongsTo(() => Course, { foreignKey: 'course_id' })
  declare course: Course;

  @BelongsTo(() => CourseModule, { foreignKey: 'module_id' })
  declare module: CourseModule;

  @BelongsTo(() => User, { foreignKey: 'created_by' })
  declare creator: User;

  @BelongsToMany(() => Batch, () => AssignmentBatch)
  declare batches: Batch[];

  @HasMany(() => require('./AssignmentSubmission').AssignmentSubmission, { foreignKey: 'assignment_id' })
  declare submissions: AssignmentSubmission[];
}
