import {
  Table, Column, Model, DataType,
  BelongsTo, ForeignKey, AllowNull,
} from 'sequelize-typescript';
import { User } from './User';

@Table({ tableName: 'trainer_profiles', timestamps: true, createdAt: false, updatedAt: 'updated_at' })
export class TrainerProfile extends Model {
  @ForeignKey(() => User)
  @Column({ field: 'user_id', type: DataType.UUID, primaryKey: true })
  declare userId: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare bio: string | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare skills: string | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare linkedin: string | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare phone: string | null;

  @BelongsTo(() => User, { foreignKey: 'user_id' })
  declare user: User;
}
