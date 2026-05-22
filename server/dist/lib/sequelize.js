"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CourseSyllabus = exports.TrainerProfile = exports.Message = exports.RefreshToken = exports.Enrollment = exports.Batch = exports.Course = exports.User = exports.sequelize = void 0;
require("dotenv/config");
const sequelize_1 = require("sequelize");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL environment variable');
}
exports.sequelize = new sequelize_1.Sequelize(databaseUrl, {
    dialect: 'postgres',
    protocol: 'postgres',
    logging: false,
    pool: {
        max: 20,
        idle: 30000,
        acquire: 5000,
    },
    dialectOptions: process.env.NODE_ENV === 'production'
        ? { ssl: { rejectUnauthorized: false } }
        : undefined,
});
class User extends sequelize_1.Model {
}
exports.User = User;
User.init({
    id: {
        type: sequelize_1.DataTypes.UUID,
        primaryKey: true,
        defaultValue: sequelize_1.DataTypes.UUIDV4,
    },
    name: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    email: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
        unique: true,
    },
    password_hash: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    role: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'STUDENT',
    },
    avatar_url: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    created_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
    updated_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
}, {
    sequelize: exports.sequelize,
    tableName: 'users',
    modelName: 'User',
    timestamps: false,
});
class Course extends sequelize_1.Model {
}
exports.Course = Course;
Course.init({
    id: {
        type: sequelize_1.DataTypes.UUID,
        primaryKey: true,
        defaultValue: sequelize_1.DataTypes.UUIDV4,
    },
    title: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    category: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    status: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'ACTIVE',
    },
    level: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'INTERMEDIATE',
    },
    duration_months: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
    },
    description: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    trainer_id: {
        type: sequelize_1.DataTypes.UUID,
        allowNull: true,
    },
    color_token: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'emerald',
    },
    created_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
    updated_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
}, {
    sequelize: exports.sequelize,
    tableName: 'courses',
    modelName: 'Course',
    timestamps: false,
});
class Batch extends sequelize_1.Model {
}
exports.Batch = Batch;
Batch.init({
    id: {
        type: sequelize_1.DataTypes.UUID,
        primaryKey: true,
        defaultValue: sequelize_1.DataTypes.UUIDV4,
    },
    name: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    course_id: {
        type: sequelize_1.DataTypes.UUID,
        allowNull: false,
    },
    start_date: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
    },
    end_date: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
    },
    capacity: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 30,
    },
    status: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'UPCOMING',
    },
    created_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
    updated_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
}, {
    sequelize: exports.sequelize,
    tableName: 'batches',
    modelName: 'Batch',
    timestamps: false,
});
class Enrollment extends sequelize_1.Model {
}
exports.Enrollment = Enrollment;
Enrollment.init({
    id: {
        type: sequelize_1.DataTypes.UUID,
        primaryKey: true,
        defaultValue: sequelize_1.DataTypes.UUIDV4,
    },
    student_id: {
        type: sequelize_1.DataTypes.UUID,
        allowNull: false,
    },
    batch_id: {
        type: sequelize_1.DataTypes.UUID,
        allowNull: false,
    },
    enrolled_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
    completion_pct: {
        type: sequelize_1.DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
    },
    grade: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
}, {
    sequelize: exports.sequelize,
    tableName: 'enrollments',
    modelName: 'Enrollment',
    timestamps: false,
});
class RefreshToken extends sequelize_1.Model {
}
exports.RefreshToken = RefreshToken;
RefreshToken.init({
    id: {
        type: sequelize_1.DataTypes.UUID,
        primaryKey: true,
        defaultValue: sequelize_1.DataTypes.UUIDV4,
    },
    user_id: {
        type: sequelize_1.DataTypes.UUID,
        allowNull: false,
    },
    token: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
        unique: true,
    },
    expires_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
    },
    created_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
}, {
    sequelize: exports.sequelize,
    tableName: 'refresh_tokens',
    modelName: 'RefreshToken',
    timestamps: false,
});
class Message extends sequelize_1.Model {
}
exports.Message = Message;
Message.init({
    id: {
        type: sequelize_1.DataTypes.UUID,
        primaryKey: true,
        defaultValue: sequelize_1.DataTypes.UUIDV4,
    },
    sender_id: {
        type: sequelize_1.DataTypes.UUID,
        allowNull: false,
    },
    receiver_id: {
        type: sequelize_1.DataTypes.UUID,
        allowNull: false,
    },
    content: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    read_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    created_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
}, {
    sequelize: exports.sequelize,
    tableName: 'messages',
    modelName: 'Message',
    timestamps: false,
});
class TrainerProfile extends sequelize_1.Model {
}
exports.TrainerProfile = TrainerProfile;
TrainerProfile.init({
    user_id: {
        type: sequelize_1.DataTypes.UUID,
        primaryKey: true,
    },
    bio: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    skills: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    linkedin: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    phone: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    updated_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
}, {
    sequelize: exports.sequelize,
    tableName: 'trainer_profiles',
    modelName: 'TrainerProfile',
    timestamps: false,
});
class CourseSyllabus extends sequelize_1.Model {
}
exports.CourseSyllabus = CourseSyllabus;
CourseSyllabus.init({
    id: {
        type: sequelize_1.DataTypes.UUID,
        primaryKey: true,
        defaultValue: sequelize_1.DataTypes.UUIDV4,
    },
    course_id: {
        type: sequelize_1.DataTypes.UUID,
        allowNull: false,
    },
    filename: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    file_type: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    content_text: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    uploaded_by: {
        type: sequelize_1.DataTypes.UUID,
        allowNull: true,
    },
    created_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
}, {
    sequelize: exports.sequelize,
    tableName: 'course_syllabi',
    modelName: 'CourseSyllabus',
    timestamps: false,
});
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
exports.default = exports.sequelize;
//# sourceMappingURL=sequelize.js.map