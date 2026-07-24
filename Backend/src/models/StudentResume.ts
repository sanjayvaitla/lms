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
  tableName: 'student_resumes',
  timestamps: true,
  createdAt: false,
  updatedAt: 'updated_at',
})
export class StudentResume extends Model {
  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    allowNull: false,
  })
  student_id!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  resume_url!: string;

  @BelongsTo(() => User, 'student_id')
  student!: User;
}
