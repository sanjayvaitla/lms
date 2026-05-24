import {
  Table, Column, Model, DataType,
  BelongsTo, HasMany, HasOne, BelongsToMany, ForeignKey, Default,
} from 'sequelize-typescript';
import { Course } from './Course';
import type { Enrollment } from './Enrollment';
import type { BatchSyllabus } from './BatchSyllabus';
import type { Assignment } from './Assignment';
import type { AssignmentBatch } from './AssignmentBatch';

@Table({ tableName: 'batches', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' })
export class Batch extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column(DataType.TEXT)
  declare name: string;

  @ForeignKey(() => Course)
  @Column({ field: 'course_id', type: DataType.UUID })
  declare courseId: string;

  @Column({ field: 'start_date', type: DataType.DATE })
  declare startDate: Date;

  @Column({ field: 'end_date', type: DataType.DATE })
  declare endDate: Date;

  @Default(30)
  @Column(DataType.INTEGER)
  declare capacity: number;

  @Default('UPCOMING')
  @Column(DataType.TEXT)
  declare status: 'UPCOMING' | 'ONGOING' | 'COMPLETED';

  @BelongsTo(() => Course, { foreignKey: 'course_id' })
  declare course: Course;

  @HasMany(() => require('./Enrollment').Enrollment, { foreignKey: 'batch_id' })
  declare enrollments: Enrollment[];

  @HasOne(() => require('./BatchSyllabus').BatchSyllabus, { foreignKey: 'batch_id' })
  declare batchSyllabus: BatchSyllabus;

  @BelongsToMany(() => require('./Assignment').Assignment, () => require('./AssignmentBatch').AssignmentBatch)
  declare assignments: Assignment[];
}
