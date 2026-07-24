import {
  Table, Column, Model, DataType,
  BelongsTo, ForeignKey, AllowNull, Default,
} from 'sequelize-typescript';
import { User } from './User';

@Table({ tableName: 'whatsapp_messages', timestamps: true, createdAt: 'created_at', updatedAt: false })
export class WhatsAppMessage extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column({ field: 'from_phone', type: DataType.TEXT })
  declare fromPhone: string;

  @AllowNull(true)
  @ForeignKey(() => User)
  @Column({ field: 'user_id', type: DataType.UUID })
  declare userId: string | null;

  @Default('INBOUND')
  @Column({ type: DataType.TEXT })
  declare direction: 'INBOUND' | 'OUTBOUND';

  @Default('text')
  @Column({ field: 'message_type', type: DataType.TEXT })
  declare messageType: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare content: string | null;

  @AllowNull(true)
  @Column({ field: 'wa_message_id', type: DataType.TEXT })
  declare waMessageId: string | null;

  @BelongsTo(() => User, { foreignKey: 'user_id', as: 'user' })
  declare user: User;
}
