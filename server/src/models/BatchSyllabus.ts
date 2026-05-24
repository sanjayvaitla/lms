import {
  Table, Column, Model, DataType,
  BelongsTo, ForeignKey, Default,
} from 'sequelize-typescript';
import { Batch } from './Batch';
import { CourseSyllabus } from './CourseSyllabus';

@Table({ tableName: 'batch_syllabi', timestamps: false })
export class BatchSyllabus extends Model {
  @ForeignKey(() => Batch)
  @Column({ field: 'batch_id', type: DataType.UUID, primaryKey: true })
  declare batchId: string;

  @ForeignKey(() => CourseSyllabus)
  @Column({ field: 'syllabus_id', type: DataType.UUID })
  declare syllabusId: string;

  @Default(DataType.NOW)
  @Column({ field: 'assigned_at', type: DataType.DATE })
  declare assignedAt: Date;

  @BelongsTo(() => Batch, { foreignKey: 'batch_id' })
  declare batch: Batch;

  @BelongsTo(() => CourseSyllabus, { foreignKey: 'syllabus_id' })
  declare syllabus: CourseSyllabus;
}
