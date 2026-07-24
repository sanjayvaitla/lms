import {
  Table, Column, Model, DataType,
  BelongsTo, ForeignKey, Default, AllowNull, Unique,
} from 'sequelize-typescript';
import { User }              from './User';
import { AttendanceSession } from './AttendanceSession';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

@Table({
  tableName:  'attendance_records',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['session_id', 'student_id'] },
  ],
})
export class AttendanceRecord extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => AttendanceSession)
  @Column({ field: 'session_id', type: DataType.UUID, allowNull: false })
  declare sessionId: string;

  @ForeignKey(() => User)
  @Column({ field: 'student_id', type: DataType.UUID, allowNull: false })
  declare studentId: string;

  /** PRESENT | ABSENT | LATE | EXCUSED */
  @Default('ABSENT')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: AttendanceStatus;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'marked_by', type: DataType.UUID })
  declare markedBy: string | null;

  @Default(DataType.NOW)
  @Column({ field: 'marked_at', type: DataType.DATE })
  declare markedAt: Date;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare remarks: string | null;

  // ── Associations ───────────────────────────────────────────────────────────
  @BelongsTo(() => AttendanceSession, { foreignKey: 'session_id' })
  declare session: AttendanceSession;

  @BelongsTo(() => User, { foreignKey: 'student_id', as: 'student' })
  declare student: User;

  @BelongsTo(() => User, { foreignKey: 'marked_by', as: 'marker' })
  declare marker: User;
}
