import {
  Table, Column, Model, DataType,
  BelongsTo, HasMany, ForeignKey, Default, AllowNull,
} from 'sequelize-typescript';
import { User } from './User';
import type { Batch } from './Batch';
import type { CourseSyllabus } from './CourseSyllabus';
import type { CourseModule } from './CourseModule';
import type { Quiz } from './Quiz';
import type { Assignment } from './Assignment';

@Table({ tableName: 'courses', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' })
export class Course extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column(DataType.TEXT)
  declare title: string;

  @Column(DataType.TEXT)
  declare category: string;

  @Default('ACTIVE')
  @Column(DataType.TEXT)
  declare status: 'ACTIVE' | 'NEW' | 'DRAFT' | 'ARCHIVED';

  @Default('INTERMEDIATE')
  @Column(DataType.TEXT)
  declare level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

  @Column({ field: 'duration_months', type: DataType.INTEGER })
  declare durationMonths: number;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare description: string | null;

  @AllowNull(true)
  @ForeignKey(() => User)
  @Column({ field: 'trainer_id', type: DataType.UUID })
  declare trainerId: string | null;

  @Default('emerald')
  @Column({ field: 'color_token', type: DataType.TEXT })
  declare colorToken: string;

  @BelongsTo(() => User, { foreignKey: 'trainer_id' })
  declare trainer: User;

  @HasMany(() => require('./Batch').Batch, { foreignKey: 'course_id' })
  declare batches: Batch[];

  @HasMany(() => require('./CourseSyllabus').CourseSyllabus, { foreignKey: 'course_id' })
  declare syllabi: CourseSyllabus[];

  @HasMany(() => require('./CourseModule').CourseModule, { foreignKey: 'course_id' })
  declare modules: CourseModule[];

  @HasMany(() => require('./Quiz').Quiz, { foreignKey: 'course_id' })
  declare quizzes: Quiz[];

  @HasMany(() => require('./Assignment').Assignment, { foreignKey: 'course_id' })
  declare assignments: Assignment[];
}
