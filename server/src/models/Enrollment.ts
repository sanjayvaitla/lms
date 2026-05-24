import {
  Table, Column, Model, DataType,
  BelongsTo, ForeignKey, Default, AllowNull,
} from 'sequelize-typescript';
import { User } from './User';
import { Batch } from './Batch';

@Table({ tableName: 'enrollments', timestamps: false })
export class Enrollment extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ field: 'student_id', type: DataType.UUID })
  declare studentId: string;

  @ForeignKey(() => Batch)
  @Column({ field: 'batch_id', type: DataType.UUID })
  declare batchId: string;

  @Default(DataType.NOW)
  @Column({ field: 'enrolled_at', type: DataType.DATE })
  declare enrolledAt: Date;

  @Default(0)
  @Column({ field: 'completion_pct', type: DataType.FLOAT })
  declare completionPct: number;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare grade: string | null;

  @BelongsTo(() => User, { foreignKey: 'student_id' })
  declare student: User;

  @BelongsTo(() => Batch, { foreignKey: 'batch_id' })
  declare batch: Batch;
}
