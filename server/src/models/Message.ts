import {
  Table, Column, Model, DataType,
  BelongsTo, ForeignKey, AllowNull,
} from 'sequelize-typescript';
import { User } from './User';

@Table({ tableName: 'messages', timestamps: true, createdAt: 'created_at', updatedAt: false })
export class Message extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ field: 'sender_id', type: DataType.UUID })
  declare senderId: string;

  @ForeignKey(() => User)
  @Column({ field: 'receiver_id', type: DataType.UUID })
  declare receiverId: string;

  @Column(DataType.TEXT)
  declare content: string;

  @AllowNull(true)
  @Column({ field: 'read_at', type: DataType.DATE })
  declare readAt: Date | null;

  @BelongsTo(() => User, { foreignKey: 'sender_id', as: 'sender' })
  declare sender: User;

  @BelongsTo(() => User, { foreignKey: 'receiver_id', as: 'receiver' })
  declare receiver: User;
}
