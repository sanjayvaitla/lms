import {
  Table, Column, Model, DataType,
  ForeignKey,
} from 'sequelize-typescript';
import { Assignment } from './Assignment';
import { Batch } from './Batch';

@Table({ tableName: 'assignment_batches', timestamps: false })
export class AssignmentBatch extends Model {
  @ForeignKey(() => Assignment)
  @Column({ field: 'assignment_id', type: DataType.UUID, primaryKey: true })
  declare assignmentId: string;

  @ForeignKey(() => Batch)
  @Column({ field: 'batch_id', type: DataType.UUID, primaryKey: true })
  declare batchId: string;
}
