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
  tableName: 'placement_matches',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
})
export class PlacementMatch extends Model {
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
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  match_percentage!: number;

  @Column({
    type: DataType.JSON,
    allowNull: true,
  })
  matching_skills?: any;

  @Column({
    type: DataType.JSON,
    allowNull: true,
  })
  missing_skills?: any;

  @BelongsTo(() => PlacementJob, 'job_id')
  job!: PlacementJob;

  @BelongsTo(() => User, 'student_id')
  student!: User;
}
