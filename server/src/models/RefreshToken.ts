import {
  Table, Column, Model, DataType,
  BelongsTo, ForeignKey, Unique,
} from 'sequelize-typescript';
import { User } from './User';

@Table({ tableName: 'refresh_tokens', timestamps: true, createdAt: 'created_at', updatedAt: false })
export class RefreshToken extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ field: 'user_id', type: DataType.UUID })
  declare userId: string;

  @Unique
  @Column(DataType.TEXT)
  declare token: string;

  @Column({ field: 'expires_at', type: DataType.DATE })
  declare expiresAt: Date;

  @BelongsTo(() => User, { foreignKey: 'user_id' })
  declare user: User;
}
