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
  tableName: 'placement_jobs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
})
export class PlacementJob extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  company_name!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  job_description!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  ctc!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  qualification!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  experience!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  attachment_url?: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  created_by!: string;

  @Column({
    type: DataType.ENUM('ACTIVE', 'CLOSED'),
    defaultValue: 'ACTIVE',
    allowNull: false,
  })
  status!: string;

  @BelongsTo(() => User, 'created_by')
  creator!: User;
}
