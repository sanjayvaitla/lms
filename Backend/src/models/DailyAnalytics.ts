import { Table, Column, Model, DataType, Default } from 'sequelize-typescript';

@Table({
  tableName: 'daily_analytics',
  timestamps: true
})
export class DailyAnalytics extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true
  })
  id!: string;

  @Column({
    type: DataType.DATEONLY,
    allowNull: false
  })
  date!: Date;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  metricType!: string; // e.g., 'PAGE_VIEW_TOTALS', 'LOGIN_TOTALS'

  @Column({
    type: DataType.JSONB,
    allowNull: false
  })
  data!: any; // e.g., { "Dashboard": 1500, "Courses": 3000 } or { "STUDENT": 500, "TRAINER": 20 }
}
