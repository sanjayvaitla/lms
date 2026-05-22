"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DATASETS_DIR = exports.ASSIGNMENTS_DIR = exports.UPLOADS_ROOT = void 0;
exports.ensureUploadDirs = ensureUploadDirs;
exports.safeFilename = safeFilename;
exports.relativeUploadPath = relativeUploadPath;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
exports.UPLOADS_ROOT = path_1.default.join(__dirname, '../../uploads');
exports.ASSIGNMENTS_DIR = path_1.default.join(exports.UPLOADS_ROOT, 'assignments');
exports.DATASETS_DIR = path_1.default.join(exports.UPLOADS_ROOT, 'datasets');
function ensureUploadDirs() {
    for (const dir of [exports.UPLOADS_ROOT, exports.ASSIGNMENTS_DIR, exports.DATASETS_DIR]) {
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
    }
}
function safeFilename(original) {
    const base = path_1.default.basename(original).replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${Date.now()}-${base}`;
}
function relativeUploadPath(subdir, filename) {
    return path_1.default.join(subdir, filename).replace(/\\/g, '/');
}
//# sourceMappingURL=uploads.js.map