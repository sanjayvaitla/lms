import {
  Table, Column, Model, DataType,
  BelongsTo, ForeignKey, AllowNull,
} from 'sequelize-typescript';
import { User } from './User';

@Table({ tableName: 'program_feedbacks', timestamps: true, createdAt: 'created_at', updatedAt: false })
export class ProgramFeedback extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column({ field: 'program_id', type: DataType.UUID, allowNull: false })
  declare programId: string;

  @ForeignKey(() => User)
  @Column({ field: 'student_id', type: DataType.UUID, allowNull: false })
  declare studentId: string;

  @Column({ field: 'student_name', type: DataType.STRING, allowNull: false })
  declare studentName: string;

  @Column({ field: 'student_email', type: DataType.STRING, allowNull: false })
  declare studentEmail: string;

  @Column({ field: 'program_curriculum_relevance', type: DataType.INTEGER, allowNull: false })
  declare programCurriculumRelevance: number;

  @Column({ field: 'learning_outcome_achievement', type: DataType.INTEGER, allowNull: false })
  declare learningOutcomeAchievement: number;

  @Column({ field: 'practical_learning_experience', type: DataType.INTEGER, allowNull: false })
  declare practicalLearningExperience: number;

  @Column({ field: 'placement_career_readiness_support', type: DataType.INTEGER, allowNull: false })
  declare placementCareerReadinessSupport: number;

  @Column({ field: 'overall_program_satisfaction', type: DataType.INTEGER, allowNull: false })
  declare overallProgramSatisfaction: number;

  @AllowNull(true)
  @Column({ field: 'most_liked', type: DataType.TEXT })
  declare mostLiked: string | null;

  @AllowNull(true)
  @Column({ field: 'improvements_suggested', type: DataType.TEXT })
  declare improvementsSuggested: string | null;

  @AllowNull(true)
  @Column({ field: 'additional_comments', type: DataType.TEXT })
  declare additionalComments: string | null;

  @BelongsTo(() => User, { foreignKey: 'student_id' })
  declare student: User;
}
