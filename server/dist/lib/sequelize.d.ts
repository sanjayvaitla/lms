import 'dotenv/config';
import { Sequelize, Model, Optional } from 'sequelize';
export declare const sequelize: Sequelize;
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
interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'avatar_url' | 'created_at' | 'updated_at'> {
}
export declare class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
    id: string;
    name: string;
    email: string;
    password_hash: string;
    role: string;
    avatar_url: string | null;
    created_at: Date;
    updated_at: Date;
}
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
interface CourseCreationAttributes extends Optional<CourseAttributes, 'id' | 'description' | 'trainer_id' | 'created_at' | 'updated_at'> {
}
export declare class Course extends Model<CourseAttributes, CourseCreationAttributes> implements CourseAttributes {
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
interface BatchCreationAttributes extends Optional<BatchAttributes, 'id' | 'created_at' | 'updated_at'> {
}
export declare class Batch extends Model<BatchAttributes, BatchCreationAttributes> implements BatchAttributes {
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
interface EnrollmentAttributes {
    id: string;
    student_id: string;
    batch_id: string;
    enrolled_at: Date;
    completion_pct: number;
    grade: string | null;
}
interface EnrollmentCreationAttributes extends Optional<EnrollmentAttributes, 'id' | 'enrolled_at' | 'grade'> {
}
export declare class Enrollment extends Model<EnrollmentAttributes, EnrollmentCreationAttributes> implements EnrollmentAttributes {
    id: string;
    student_id: string;
    batch_id: string;
    enrolled_at: Date;
    completion_pct: number;
    grade: string | null;
}
interface RefreshTokenAttributes {
    id: string;
    user_id: string;
    token: string;
    expires_at: Date;
    created_at: Date;
}
interface RefreshTokenCreationAttributes extends Optional<RefreshTokenAttributes, 'id' | 'created_at'> {
}
export declare class RefreshToken extends Model<RefreshTokenAttributes, RefreshTokenCreationAttributes> implements RefreshTokenAttributes {
    id: string;
    user_id: string;
    token: string;
    expires_at: Date;
    created_at: Date;
}
interface MessageAttributes {
    id: string;
    sender_id: string;
    receiver_id: string;
    content: string;
    read_at: Date | null;
    created_at: Date;
}
interface MessageCreationAttributes extends Optional<MessageAttributes, 'id' | 'read_at' | 'created_at'> {
}
export declare class Message extends Model<MessageAttributes, MessageCreationAttributes> implements MessageAttributes {
    id: string;
    sender_id: string;
    receiver_id: string;
    content: string;
    read_at: Date | null;
    created_at: Date;
}
interface TrainerProfileAttributes {
    user_id: string;
    bio: string | null;
    skills: string | null;
    linkedin: string | null;
    phone: string | null;
    updated_at: Date;
}
interface TrainerProfileCreationAttributes extends Optional<TrainerProfileAttributes, 'bio' | 'skills' | 'linkedin' | 'phone' | 'updated_at'> {
}
export declare class TrainerProfile extends Model<TrainerProfileAttributes, TrainerProfileCreationAttributes> implements TrainerProfileAttributes {
    user_id: string;
    bio: string | null;
    skills: string | null;
    linkedin: string | null;
    phone: string | null;
    updated_at: Date;
}
interface CourseSyllabusAttributes {
    id: string;
    course_id: string;
    filename: string;
    file_type: 'PDF' | 'EXCEL';
    content_text: string;
    uploaded_by: string | null;
    created_at: Date;
}
interface CourseSyllabusCreationAttributes extends Optional<CourseSyllabusAttributes, 'id' | 'uploaded_by' | 'created_at'> {
}
export declare class CourseSyllabus extends Model<CourseSyllabusAttributes, CourseSyllabusCreationAttributes> implements CourseSyllabusAttributes {
    id: string;
    course_id: string;
    filename: string;
    file_type: 'PDF' | 'EXCEL';
    content_text: string;
    uploaded_by: string | null;
    created_at: Date;
}
export default sequelize;
//# sourceMappingURL=sequelize.d.ts.map