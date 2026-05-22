import 'dotenv/config';
import { Sequelize, DataTypes, Model, Optional } from 'sequelize';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL environment variable');
}

export const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false,
  pool: {
    max: 20,
    idle: 30_000,
    acquire: 5_000,
  },
  dialectOptions:
    process.env.NODE_ENV === 'production'
      ? { ssl: { rejectUnauthorized: false } }
      : undefined,
});

interface UserAttributes {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  avatar_url: string | null;
  created_at: Date;
  updated_at: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'avatar_url' | 'created_at' | 'updated_at'> {}

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string;
  declare name: string;
  declare email: string;
  declare password_hash: string;
  declare role: string;
  declare avatar_url: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    email: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    password_hash: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    role: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: 'STUDENT',
    },
    avatar_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'users',
    modelName: 'User',
    timestamps: false,
  },
);

interface CourseAttributes {
  id: string;
  title: string;
  category: string;
  status: string;
  level: string;
  duration_months: number;
  description: string | null;
  trainer_id: string | null;
  color_token: string;
  created_at: Date;
  updated_at: Date;
}

interface CourseCreationAttributes extends Optional<CourseAttributes, 'id' | 'description' | 'trainer_id' | 'created_at' | 'updated_at'> {}

export class Course extends Model<CourseAttributes, CourseCreationAttributes> implements CourseAttributes {
  declare id: string;
  declare title: string;
  declare category: string;
  declare status: string;
  declare level: string;
  declare duration_months: number;
  declare description: string | null;
  declare trainer_id: string | null;
  declare color_token: string;
  declare created_at: Date;
  declare updated_at: Date;
}

Course.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    title: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    category: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    level: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: 'INTERMEDIATE',
    },
    duration_months: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    trainer_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    color_token: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: 'emerald',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'courses',
    modelName: 'Course',
    timestamps: false,
  },
);

interface BatchAttributes {
  id: string;
  name: string;
  course_id: string;
  start_date: Date;
  end_date: Date;
  capacity: number;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface BatchCreationAttributes extends Optional<BatchAttributes, 'id' | 'created_at' | 'updated_at'> {}

export class Batch extends Model<BatchAttributes, BatchCreationAttributes> implements BatchAttributes {
  declare id: string;
  declare name: string;
  declare course_id: string;
  declare start_date: Date;
  declare end_date: Date;
  declare capacity: number;
  declare status: string;
  declare created_at: Date;
  declare updated_at: Date;
}

Batch.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    course_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    start_date: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    end_date: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    capacity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
    },
    status: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: 'UPCOMING',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'batches',
    modelName: 'Batch',
    timestamps: false,
  },
);

interface EnrollmentAttributes {
  id: string;
  student_id: string;
  batch_id: string;
  enrolled_at: Date;
  completion_pct: number;
  grade: string | null;
}

interface EnrollmentCreationAttributes extends Optional<EnrollmentAttributes, 'id' | 'enrolled_at' | 'grade'> {}

export class Enrollment extends Model<EnrollmentAttributes, EnrollmentCreationAttributes> implements EnrollmentAttributes {
  declare id: string;
  declare student_id: string;
  declare batch_id: string;
  declare enrolled_at: Date;
  declare completion_pct: number;
  declare grade: string | null;
}

Enrollment.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    student_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    batch_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    enrolled_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    completion_pct: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    grade: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'enrollments',
    modelName: 'Enrollment',
    timestamps: false,
  },
);

interface RefreshTokenAttributes {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  created_at: Date;
}

interface RefreshTokenCreationAttributes extends Optional<RefreshTokenAttributes, 'id' | 'created_at'> {}

export class RefreshToken extends Model<RefreshTokenAttributes, RefreshTokenCreationAttributes> implements RefreshTokenAttributes {
  declare id: string;
  declare user_id: string;
  declare token: string;
  declare expires_at: Date;
  declare created_at: Date;
}

RefreshToken.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    token: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'refresh_tokens',
    modelName: 'RefreshToken',
    timestamps: false,
  },
);

interface MessageAttributes {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read_at: Date | null;
  created_at: Date;
}

interface MessageCreationAttributes extends Optional<MessageAttributes, 'id' | 'read_at' | 'created_at'> {}

export class Message extends Model<MessageAttributes, MessageCreationAttributes> implements MessageAttributes {
  declare id: string;
  declare sender_id: string;
  declare receiver_id: string;
  declare content: string;
  declare read_at: Date | null;
  declare created_at: Date;
}

Message.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    sender_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    receiver_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    read_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'messages',
    modelName: 'Message',
    timestamps: false,
  },
);

interface TrainerProfileAttributes {
  user_id: string;
  bio: string | null;
  skills: string | null;
  linkedin: string | null;
  phone: string | null;
  updated_at: Date;
}

interface TrainerProfileCreationAttributes extends Optional<TrainerProfileAttributes, 'bio' | 'skills' | 'linkedin' | 'phone' | 'updated_at'> {}

export class TrainerProfile extends Model<TrainerProfileAttributes, TrainerProfileCreationAttributes> implements TrainerProfileAttributes {
  declare user_id: string;
  declare bio: string | null;
  declare skills: string | null;
  declare linkedin: string | null;
  declare phone: string | null;
  declare updated_at: Date;
}

TrainerProfile.init(
  {
    user_id: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    skills: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    linkedin: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    phone: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'trainer_profiles',
    modelName: 'TrainerProfile',
    timestamps: false,
  },
);

interface CourseSyllabusAttributes {
  id: string;
  course_id: string;
  filename: string;
  file_type: 'PDF' | 'EXCEL';
  content_text: string;
  uploaded_by: string | null;
  created_at: Date;
}

interface CourseSyllabusCreationAttributes extends Optional<CourseSyllabusAttributes, 'id' | 'uploaded_by' | 'created_at'> {}

export class CourseSyllabus extends Model<CourseSyllabusAttributes, CourseSyllabusCreationAttributes> implements CourseSyllabusAttributes {
  declare id: string;
  declare course_id: string;
  declare filename: string;
  declare file_type: 'PDF' | 'EXCEL';
  declare content_text: string;
  declare uploaded_by: string | null;
  declare created_at: Date;
}

CourseSyllabus.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    course_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    filename: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    file_type: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    content_text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    uploaded_by: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'course_syllabi',
    modelName: 'CourseSyllabus',
    timestamps: false,
  },
);

// ── Associations ─────────────────────────────────────────────────────────────
User.hasMany(Course, { foreignKey: 'trainer_id', as: 'courses' });
Course.belongsTo(User, { foreignKey: 'trainer_id', as: 'trainer' });

Course.hasMany(Batch, { foreignKey: 'course_id', as: 'batches' });
Batch.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });

Batch.hasMany(Enrollment, { foreignKey: 'batch_id', as: 'enrollments' });
Enrollment.belongsTo(Batch, { foreignKey: 'batch_id', as: 'batch' });

User.hasMany(Enrollment, { foreignKey: 'student_id', as: 'enrollments' });
Enrollment.belongsTo(User, { foreignKey: 'student_id', as: 'student' });

User.hasMany(RefreshToken, { foreignKey: 'user_id', as: 'refreshTokens' });
RefreshToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasOne(TrainerProfile, { foreignKey: 'user_id', as: 'trainerProfile' });
TrainerProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Course.hasMany(CourseSyllabus, { foreignKey: 'course_id', as: 'syllabi' });
CourseSyllabus.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });

User.hasMany(CourseSyllabus, { foreignKey: 'uploaded_by', as: 'uploadedSyllabi' });
CourseSyllabus.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' });

export default sequelize;
