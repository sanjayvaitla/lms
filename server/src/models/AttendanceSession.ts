import {
  Table, Column, Model, DataType,
  BelongsTo, HasMany, ForeignKey, Default, AllowNull,
} from 'sequelize-typescript';
import { User }  from './User';
import { Batch } from './Batch';
import type { AttendanceRecord } from './AttendanceRecord';

export type AttendanceSessionStatus = 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';

@Table({
  tableName:  'attendance_sessions',
  timestamps: true,
  createdAt:  'created_at',
  updatedAt:  'updated_at',
})
export class AttendanceSession extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Batch)
  @Column({ field: 'batch_id', type: DataType.UUID, allowNull: false })
  declare batchId: string;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'trainer_id', type: DataType.UUID })
  declare trainerId: string | null;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare title: string;

  @Column({ field: 'session_date', type: DataType.DATEONLY, allowNull: false })
  declare sessionDate: string; // 'YYYY-MM-DD'

  @AllowNull(true)
  @Column({ field: 'start_time', type: DataType.TIME })
  declare startTime: string | null;

  @AllowNull(true)
  @Column({ field: 'end_time', type: DataType.TIME })
  declare endTime: string | null;

  @AllowNull(true)
  @Column({ field: 'duration_min', type: DataType.INTEGER })
  declare durationMin: number | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare topic: string | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare notes: string | null;

  @Default('SCHEDULED')
  @Column(DataType.TEXT)
  declare status: AttendanceSessionStatus;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'created_by', type: DataType.UUID })
  declare createdBy: string | null;

  // ── Associations ───────────────────────────────────────────────────────────
  @BelongsTo(() => Batch,  { foreignKey: 'batch_id' })
  declare batch: Batch;

  @BelongsTo(() => User, { foreignKey: 'trainer_id', as: 'trainer' })
  declare trainer: User;

  @BelongsTo(() => User, { foreignKey: 'created_by', as: 'creator' })
  declare creator: User;

  @HasMany(() => require('./AttendanceRecord').AttendanceRecord, { foreignKey: 'session_id' })
  declare records: AttendanceRecord[];
}
