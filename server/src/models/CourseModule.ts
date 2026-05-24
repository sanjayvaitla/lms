import {
  Table, Column, Model, DataType,
  BelongsTo, HasMany, ForeignKey, Default, AllowNull,
} from 'sequelize-typescript';
import { Course } from './Course';
import { User } from './User';
import type { Quiz } from './Quiz';
import type { QuizQuestion } from './QuizQuestion';
import type { Assignment } from './Assignment';

@Table({ tableName: 'course_modules', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' })
export class CourseModule extends Model {
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

  @Default(0)
  @Column({ field: 'sort_order', type: DataType.INTEGER })
  declare sortOrder: number;

  @Default('LOCKED')
  @Column(DataType.TEXT)
  declare status: 'LOCKED' | 'RELEASED' | 'COMPLETED';

  @AllowNull(true)
  @Column({ field: 'completed_at', type: DataType.DATE })
  declare completedAt: Date | null;

  @AllowNull(true)
  @ForeignKey(() => User)
  @Column({ field: 'completed_by', type: DataType.UUID })
  declare completedBy: string | null;

  @BelongsTo(() => Course, { foreignKey: 'course_id' })
  declare course: Course;

  @BelongsTo(() => User, { foreignKey: 'completed_by' })
  declare completedByUser: User;

  @HasMany(() => require('./Quiz').Quiz, { foreignKey: 'module_id' })
  declare quizzes: Quiz[];

  @HasMany(() => require('./QuizQuestion').QuizQuestion, { foreignKey: 'module_id' })
  declare questions: QuizQuestion[];

  @HasMany(() => require('./Assignment').Assignment, { foreignKey: 'module_id' })
  declare assignments: Assignment[];
}
