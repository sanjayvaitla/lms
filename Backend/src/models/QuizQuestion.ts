import {
  Table, Column, Model, DataType,
  BelongsTo, HasMany, ForeignKey, Default, AllowNull,
} from 'sequelize-typescript';
import { Course } from './Course';
import { CourseModule } from './CourseModule';
import type { QuizAttemptAnswer } from './QuizAttemptAnswer';

@Table({ tableName: 'quiz_questions', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' })
export class QuizQuestion extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Course)
  @Column({ field: 'course_id', type: DataType.UUID })
  declare courseId: string;

  @AllowNull(true)
  @ForeignKey(() => CourseModule)
  @Column({ field: 'module_id', type: DataType.UUID })
  declare moduleId: string | null;

  @AllowNull(true)
  @Column({ field: 'dataset_id', type: DataType.UUID })
  declare datasetId: string | null;

  @Column({ field: 'question_text', type: DataType.TEXT })
  declare questionText: string;

  @Default('MCQ')
  @Column({ field: 'question_type', type: DataType.TEXT })
  declare questionType: 'MCQ' | 'TRUE_FALSE' | 'SHORT_ANSWER';

  @AllowNull(true)
  @Column(DataType.JSONB)
  declare options: string[] | null;

  @Column({ field: 'correct_answer', type: DataType.TEXT })
  declare correctAnswer: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare explanation: string | null;

  @Default(1)
  @Column(DataType.INTEGER)
  declare points: number;

  @Default('MEDIUM')
  @Column(DataType.TEXT)
  declare difficulty: 'EASY' | 'MEDIUM' | 'HARD';

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare tags: string | null;

  @BelongsTo(() => Course, { foreignKey: 'course_id' })
  declare course: Course;

  @BelongsTo(() => CourseModule, { foreignKey: 'module_id' })
  declare module: CourseModule;

  @HasMany(() => require('./QuizAttemptAnswer').QuizAttemptAnswer, { foreignKey: 'question_id' })
  declare attemptAnswers: QuizAttemptAnswer[];
}
