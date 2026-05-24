import {
  Table, Column, Model, DataType,
  BelongsTo, ForeignKey, Default, Unique,
} from 'sequelize-typescript';
import { User } from './User';

@Table({ tableName: 'password_reset_tokens', timestamps: true, createdAt: 'created_at', updatedAt: false })
export class PasswordResetToken extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ field: 'user_id', type: DataType.UUID })
  declare userId: string;

  @Unique
  @Column({ field: 'token_hash', type: DataType.TEXT })
  declare tokenHash: string;

  @Column({ field: 'expires_at', type: DataType.DATE })
  declare expiresAt: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  declare used: boolean;

  @BelongsTo(() => User, { foreignKey: 'user_id' })
  declare user: User;
}
