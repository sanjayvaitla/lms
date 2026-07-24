import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { User } from './User';

@Table({
  tableName: 'ActivityLogs',
  timestamps: true,
})
export class ActivityLog extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: true, // Nullable for anonymous or system activities, though mostly tied to users
  })
  userId!: string;

  @BelongsTo(() => User)
  user!: User;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  actionType!: string; // e.g., 'LOGIN', 'VIEW_COURSE', 'ATTEMPT_QUIZ'

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  resourceType!: string; // e.g., 'Course', 'Assignment', 'Quiz'

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  resourceId!: string; // ID of the specific resource accessed

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  ipAddress!: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  metadata!: any; // Flexible JSON for extra data
}
