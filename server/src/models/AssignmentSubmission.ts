import {
  Table, Column, Model, DataType,
  BelongsTo, ForeignKey, Default, AllowNull,
} from 'sequelize-typescript';
import { Assignment } from './Assignment';
import { User } from './User';

@Table({ tableName: 'assignment_submissions', timestamps: false })
export class AssignmentSubmission extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Assignment)
  @Column({ field: 'assignment_id', type: DataType.UUID })
  declare assignmentId: string;

  @ForeignKey(() => User)
  @Column({ field: 'student_id', type: DataType.UUID })
  declare studentId: string;

  @AllowNull(true)
  @Column({ field: 'file_path', type: DataType.TEXT })
  declare filePath: string | null;

  @Default(DataType.NOW)
  @Column({ field: 'submitted_at', type: DataType.DATE })
  declare submittedAt: Date;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  declare score: number | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare feedback: string | null;

  @Default('SUBMITTED')
  @Column(DataType.TEXT)
  declare status: 'SUBMITTED' | 'GRADED' | 'LATE';

  @BelongsTo(() => Assignment, { foreignKey: 'assignment_id' })
  declare assignment: Assignment;

  @BelongsTo(() => User, { foreignKey: 'student_id' })
  declare student: User;
}
