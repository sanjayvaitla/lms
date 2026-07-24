import {
  Table, Column, Model, DataType,
  BelongsTo, HasMany, ForeignKey, Default, AllowNull,
} from 'sequelize-typescript';
import { Course } from './Course';
import { CourseModule } from './CourseModule';
import { User } from './User';
import type { QuizAttempt } from './QuizAttempt';

@Table({ tableName: 'quizzes', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' })
export class Quiz extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Course)
  @Column({ field: 'course_id', type: DataType.UUID })
  declare courseId: string;

  @ForeignKey(() => CourseModule)
  @Column({ field: 'module_id', type: DataType.UUID })
  declare moduleId: string;

  @Column(DataType.TEXT)
  declare title: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare description: string | null;

  @Default(10)
  @Column({ field: 'questions_per_attempt', type: DataType.INTEGER })
  declare questionsPerAttempt: number;

  @AllowNull(true)
  @Column({ field: 'time_limit_minutes', type: DataType.INTEGER })
  declare timeLimitMinutes: number | null;

  @Default(70)
  @Column({ field: 'passing_score', type: DataType.INTEGER })
  declare passingScore: number;

  @Default(true)
  @Column({ field: 'randomize_questions', type: DataType.BOOLEAN })
  declare randomizeQuestions: boolean;

  @Default(true)
  @Column({ field: 'randomize_options', type: DataType.BOOLEAN })
  declare randomizeOptions: boolean;

  @Default(3)
  @Column({ field: 'max_attempts', type: DataType.INTEGER })
  declare maxAttempts: number;

  @Default('DRAFT')
  @Column(DataType.TEXT)
  declare status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

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

  @HasMany(() => require('./QuizAttempt').QuizAttempt, { foreignKey: 'quiz_id' })
  declare attempts: QuizAttempt[];
}
