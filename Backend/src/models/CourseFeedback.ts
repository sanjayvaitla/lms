import {
  Table, Column, Model, DataType,
  BelongsTo, ForeignKey, AllowNull,
} from 'sequelize-typescript';
import { Batch } from './Batch';
import { Course } from './Course';
import { User } from './User';

@Table({ tableName: 'course_feedbacks', timestamps: true, createdAt: 'created_at', updatedAt: false })
export class CourseFeedback extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Batch)
  @Column({ field: 'batch_id', type: DataType.UUID, allowNull: false })
  declare batchId: string;

  @ForeignKey(() => Course)
  @Column({ field: 'course_id', type: DataType.UUID, allowNull: false })
  declare courseId: string;

  @ForeignKey(() => User)
  @Column({ field: 'student_id', type: DataType.UUID, allowNull: false })
  declare studentId: string;

  @Column({ field: 'course_content_quality', type: DataType.INTEGER, allowNull: false })
  declare courseContentQuality: number;

  @Column({ field: 'concept_clarity', type: DataType.INTEGER, allowNull: false })
  declare conceptClarity: number;

  @Column({ field: 'practical_exercises', type: DataType.INTEGER, allowNull: false })
  declare practicalExercises: number;

  @Column({ field: 'course_assessment_structure', type: DataType.INTEGER, allowNull: false })
  declare courseAssessmentStructure: number;

  @Column({ field: 'overall_course_satisfaction', type: DataType.INTEGER, allowNull: false })
  declare overallCourseSatisfaction: number;

  @AllowNull(true)
  @Column({ field: 'additional_comments', type: DataType.TEXT })
  declare additionalComments: string | null;

  @AllowNull(true)
  @Column({ field: 'most_useful_topic', type: DataType.TEXT })
  declare mostUsefulTopic: string | null;

  @AllowNull(true)
  @Column({ field: 'additional_topics', type: DataType.TEXT })
  declare additionalTopics: string | null;

  @BelongsTo(() => Batch, { foreignKey: 'batch_id' })
  declare batch: Batch;

  @BelongsTo(() => Course, { foreignKey: 'course_id' })
  declare course: Course;

  @BelongsTo(() => User, { foreignKey: 'student_id' })
  declare student: User;
}
