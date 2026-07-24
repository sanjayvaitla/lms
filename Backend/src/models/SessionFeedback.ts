import {
  Table, Column, Model, DataType,
  BelongsTo, ForeignKey, AllowNull,
} from 'sequelize-typescript';
import { Batch } from './Batch';

import { User } from './User';

@Table({ tableName: 'session_feedbacks', timestamps: true, createdAt: 'created_at', updatedAt: false })
export class SessionFeedback extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Batch)
  @Column({ field: 'batch_id', type: DataType.UUID, allowNull: false })
  declare batchId: string;

  @Column({ field: 'module_id', type: DataType.UUID, allowNull: false })
  declare moduleId: string;

  @ForeignKey(() => User)
  @Column({ field: 'student_id', type: DataType.UUID, allowNull: false })
  declare studentId: string;

  @Column({ field: 'conceptual_understanding', type: DataType.INTEGER, allowNull: true })
  declare conceptualUnderstanding: number;

  @Column({ field: 'problem_solving', type: DataType.INTEGER, allowNull: true })
  declare problemSolving: number;

  @Column({ field: 'hands_on_experience', type: DataType.INTEGER, allowNull: true })
  declare handsOnExperience: number;

  @Column({ field: 'class_participation', type: DataType.INTEGER, allowNull: true })
  declare classParticipation: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare punctuality: number;

  @AllowNull(true)
  @Column({ field: 'additional_comments', type: DataType.TEXT })
  declare additionalComments: string | null;

  
  @AllowNull(true)
  @Column({ field: 'session_content_relevance', type: DataType.INTEGER })
  declare sessionContentRelevance: number | null;

  @AllowNull(true)
  @Column({ field: 'concept_explanation', type: DataType.INTEGER })
  declare conceptExplanation: number | null;

  @AllowNull(true)
  @Column({ field: 'practical_demonstration', type: DataType.INTEGER })
  declare practicalDemonstration: number | null;

  @AllowNull(true)
  @Column({ field: 'learning_material_quality', type: DataType.INTEGER })
  declare learningMaterialQuality: number | null;

  @AllowNull(true)
  @Column({ field: 'overall_session_satisfaction', type: DataType.INTEGER })
  declare overallSessionSatisfaction: number | null;

  @AllowNull(true)
  @Column({ field: 'valuable_takeaway', type: DataType.TEXT })
  declare valuableTakeaway: string | null;

  @AllowNull(true)
  @Column({ field: 'suggestions_improvement', type: DataType.TEXT })
  declare suggestionsImprovement: string | null;

@BelongsTo(() => Batch, { foreignKey: 'batch_id' })
  declare batch: Batch;



  @BelongsTo(() => User, { foreignKey: 'student_id' })
  declare student: User;
}
