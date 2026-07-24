import {
  Table, Column, Model, DataType,
  BelongsTo, HasOne, ForeignKey, AllowNull,
} from 'sequelize-typescript';
import { Course } from './Course';
import { User } from './User';
import type { BatchSyllabus } from './BatchSyllabus';

@Table({ tableName: 'course_syllabi', timestamps: true, createdAt: 'created_at', updatedAt: false })
export class CourseSyllabus extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Course)
  @Column({ field: 'course_id', type: DataType.UUID })
  declare courseId: string;

  @Column(DataType.TEXT)
  declare filename: string;

  @Column({ field: 'file_type', type: DataType.TEXT })
  declare fileType: 'PDF' | 'EXCEL' | 'CSV';

  @Column({ field: 'content_text', type: DataType.TEXT })
  declare contentText: string;

  @AllowNull(true)
  @Column({ field: 'structured_data', type: DataType.JSONB })
  declare structuredData: object | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare label: string | null;

  @AllowNull(true)
  @ForeignKey(() => User)
  @Column({ field: 'uploaded_by', type: DataType.UUID })
  declare uploadedBy: string | null;

  @BelongsTo(() => Course, { foreignKey: 'course_id' })
  declare course: Course;

  @BelongsTo(() => User, { foreignKey: 'uploaded_by' })
  declare uploader: User;

  @HasOne(() => require('./BatchSyllabus').BatchSyllabus, { foreignKey: 'syllabus_id' })
  declare batchSyllabus: BatchSyllabus;
}
