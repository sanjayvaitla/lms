import {
  Table, Column, Model, DataType,
  HasMany, HasOne, Default, Unique, AllowNull,
} from 'sequelize-typescript';
import type { Course } from './Course';
import type { Enrollment } from './Enrollment';
import type { RefreshToken } from './RefreshToken';
import type { TrainerProfile } from './TrainerProfile';
import type { CourseSyllabus } from './CourseSyllabus';

@Table({ tableName: 'users', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' })
export class User extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column(DataType.TEXT)
  declare name: string;

  @AllowNull(true)
  @Unique
  @Column(DataType.TEXT)
  declare email: string | null;

  @AllowNull(true)
  @Column({ field: 'password_hash', type: DataType.TEXT })
  declare passwordHash: string | null;

  @Default('STUDENT')
  @Column(DataType.TEXT)
  declare role: 'SUPER_ADMIN' | 'ADMIN' | 'TRAINER' | 'STUDENT';

  @AllowNull(true)
  @Column({ field: 'avatar_url', type: DataType.TEXT })
  declare avatarUrl: string | null;

  @Default('LOCAL')
  @Column({ field: 'auth_provider', type: DataType.TEXT })
  declare authProvider: string;

  @AllowNull(true)
  @Unique
  @Column({ field: 'google_id', type: DataType.TEXT })
  declare googleId: string | null;

  @AllowNull(true)
  @Unique
  @Column({ field: 'phone_number', type: DataType.TEXT })
  declare phoneNumber: string | null;

  @Default(false)
  @Column({ field: 'is_phone_verified', type: DataType.BOOLEAN })
  declare isPhoneVerified: boolean;

  @HasMany(() => require('./Course').Course, { foreignKey: 'trainer_id' })
  declare courses: Course[];

  @HasMany(() => require('./Enrollment').Enrollment, { foreignKey: 'student_id' })
  declare enrollments: Enrollment[];

  @HasMany(() => require('./RefreshToken').RefreshToken, { foreignKey: 'user_id' })
  declare refreshTokens: RefreshToken[];

  @HasOne(() => require('./TrainerProfile').TrainerProfile, { foreignKey: 'user_id' })
  declare trainerProfile: TrainerProfile;

  @HasMany(() => require('./CourseSyllabus').CourseSyllabus, { foreignKey: 'uploaded_by' })
  declare uploadedSyllabi: CourseSyllabus[];
}
