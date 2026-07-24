import {
  Table, Column, Model, DataType,
  BelongsTo, ForeignKey, Default,
} from 'sequelize-typescript';
import { Batch } from './Batch';

@Table({ tableName: 'batch_session_feedback_config', timestamps: false })
export class BatchSessionFeedbackConfig extends Model {
  @ForeignKey(() => Batch)
  @Column({ field: 'batch_id', type: DataType.UUID, primaryKey: true })
  declare batchId: string;

  @Column({ field: 'module_id', type: DataType.UUID, primaryKey: true })
  declare moduleId: string;

  @Default(false)
  @Column({ field: 'requires_feedback', type: DataType.BOOLEAN })
  declare requiresFeedback: boolean;

  @BelongsTo(() => Batch, { foreignKey: 'batch_id' })
  declare batch: Batch;

}
