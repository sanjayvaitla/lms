import {
  Table, Column, Model, DataType, Default,
} from 'sequelize-typescript';

@Table({ tableName: 'otp_verifications', timestamps: true, createdAt: 'created_at', updatedAt: false })
export class OtpVerification extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column(DataType.TEXT)
  declare phone: string;

  @Column({ field: 'otp_hash', type: DataType.TEXT })
  declare otpHash: string;

  @Column({ field: 'expires_at', type: DataType.DATE })
  declare expiresAt: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  declare verified: boolean;
}
