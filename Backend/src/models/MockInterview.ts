import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { User } from './User';
import { Course } from './Course';

@Table({
  tableName: 'mock_interviews',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
})
export class MockInterview extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  student_id!: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  trainer_id!: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  created_by!: string;

  @ForeignKey(() => Course)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  course_id?: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  start_time!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  end_time!: Date;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  meeting_link!: string;

  @Column({
    type: DataType.ENUM('SCHEDULED', 'COMPLETED', 'CANCELLED'),
    defaultValue: 'SCHEDULED',
    allowNull: false,
  })
  status!: string;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: true,
  })
  score?: number;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: true,
  })
  score_technical?: number;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: true,
  })
  score_problem_solving?: number;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: true,
  })
  score_coding?: number;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: true,
  })
  score_project?: number;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: true,
  })
  score_debugging?: number;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  feedback?: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  })
  is_published!: boolean;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  key_strengths?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  areas_of_improvement?: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  is_ai_driven!: boolean;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  ai_context_file_url?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  ai_topic?: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  proctor_logs?: any;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  ai_domain?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  ai_experience?: string;

  // Associations
  @BelongsTo(() => User, 'student_id')
  student!: User;

  @BelongsTo(() => User, 'trainer_id')
  trainer!: User;

  @BelongsTo(() => User, 'created_by')
  creator!: User;

  @BelongsTo(() => Course, 'course_id')
  course?: Course;
}
