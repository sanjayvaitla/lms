import {
  Table, Column, Model, DataType, ForeignKey,
} from 'sequelize-typescript';
import { Assessment } from './Assessment';
import { Batch } from './Batch';

@Table({ tableName: 'assessment_batches', timestamps: false })
export class AssessmentBatch extends Model {
  @ForeignKey(() => Assessment)
  @Column({ field: 'assessment_id', type: DataType.UUID, primaryKey: true })
  declare assessmentId: string;

  @ForeignKey(() => Batch)
  @Column({ field: 'batch_id', type: DataType.UUID, primaryKey: true })
  declare batchId: string;
}
