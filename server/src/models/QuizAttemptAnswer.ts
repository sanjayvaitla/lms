import {
  Table, Column, Model, DataType,
  BelongsTo, ForeignKey, Default, AllowNull,
} from 'sequelize-typescript';
import { QuizAttempt } from './QuizAttempt';
import { QuizQuestion } from './QuizQuestion';

@Table({ tableName: 'quiz_attempt_answers', timestamps: false })
export class QuizAttemptAnswer extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => QuizAttempt)
  @Column({ field: 'attempt_id', type: DataType.UUID })
  declare attemptId: string;

  @ForeignKey(() => QuizQuestion)
  @Column({ field: 'question_id', type: DataType.UUID })
  declare questionId: string;

  @AllowNull(true)
  @Column({ field: 'selected_answer', type: DataType.TEXT })
  declare selectedAnswer: string | null;

  @AllowNull(true)
  @Column({ field: 'is_correct', type: DataType.BOOLEAN })
  declare isCorrect: boolean | null;

  @Default(0)
  @Column({ field: 'points_awarded', type: DataType.INTEGER })
  declare pointsAwarded: number;

  @BelongsTo(() => QuizAttempt, { foreignKey: 'attempt_id' })
  declare attempt: QuizAttempt;

  @BelongsTo(() => QuizQuestion, { foreignKey: 'question_id' })
  declare question: QuizQuestion;
}
