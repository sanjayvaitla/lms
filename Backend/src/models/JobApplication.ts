import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { User } from './User';
import { PlacementJob } from './PlacementJob';

@Table({
  tableName: 'job_applications',
  timestamps: false,
})
export class JobApplication extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @ForeignKey(() => PlacementJob)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  job_id!: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  student_id!: string;

  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
    allowNull: false,
  })
  applied_at!: Date;

  @Column({
    type: DataType.ENUM('APPLIED', 'REJECTED', 'SHORTLISTED'),
    defaultValue: 'APPLIED',
    allowNull: false,
  })
  status!: string;

  @BelongsTo(() => PlacementJob, 'job_id')
  job!: PlacementJob;

  @BelongsTo(() => User, 'student_id')
  student!: User;
}
