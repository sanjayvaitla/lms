import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Batch } from './Batch';
import { CourseModule } from './CourseModule';

@Table({ tableName: 'live_class_links', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' })
export class LiveClassLink extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Batch)
  @Column({ field: 'batch_id', type: DataType.UUID, allowNull: false })
  declare batchId: string;

  @ForeignKey(() => CourseModule)
  @Column({ field: 'module_id', type: DataType.UUID, allowNull: false })
  declare moduleId: string;

  @Column(DataType.TEXT)
  declare meetLink: string;

  @BelongsTo(() => Batch)
  declare batch: Batch;

  @BelongsTo(() => CourseModule)
  declare module: CourseModule;
}
