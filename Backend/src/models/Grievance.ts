import {
  Table, Column, Model, DataType,
  BelongsTo, ForeignKey, Default
} from 'sequelize-typescript';
import { User } from './User';

@Table({ tableName: 'grievances', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' })
export class Grievance extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ field: 'student_id', type: DataType.UUID, allowNull: false })
  declare studentId: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare subject: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare description: string;

  @Default('OPEN')
  @Column({
    type: DataType.ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED'),
    allowNull: false
  })
  declare status: string;

  @BelongsTo(() => User, 'student_id')
  declare student: User;
}
