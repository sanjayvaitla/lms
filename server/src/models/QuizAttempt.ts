import {
  Table, Column, Model, DataType,
  BelongsTo, HasMany, ForeignKey, Default, AllowNull,
} from 'sequelize-typescript';
import { Quiz } from './Quiz';
import { User } from './User';
import type { QuizAttemptAnswer } from './QuizAttemptAnswer';

@Table({ tableName: 'quiz_attempts', timestamps: false })
export class QuizAttempt extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Quiz)
  @Column({ field: 'quiz_id', type: DataType.UUID })
  declare quizId: string;

  @ForeignKey(() => User)
  @Column({ field: 'student_id', type: DataType.UUID })
  declare studentId: string;

  @Default(1)
  @Column({ field: 'attempt_number', type: DataType.INTEGER })
  declare attemptNumber: number;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  declare score: number | null;

  @AllowNull(true)
  @Column(DataType.BOOLEAN)
  declare passed: boolean | null;

  @Default(DataType.NOW)
  @Column({ field: 'started_at', type: DataType.DATE })
  declare startedAt: Date;

  @AllowNull(true)
  @Column({ field: 'submitted_at', type: DataType.DATE })
  declare submittedAt: Date | null;

  @Default('IN_PROGRESS')
  @Column(DataType.TEXT)
  declare status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';

  @BelongsTo(() => Quiz, { foreignKey: 'quiz_id' })
  declare quiz: Quiz;

  @BelongsTo(() => User, { foreignKey: 'student_id' })
  declare student: User;

  @HasMany(() => require('./QuizAttemptAnswer').QuizAttemptAnswer, { foreignKey: 'attempt_id' })
  declare answers: QuizAttemptAnswer[];
}
