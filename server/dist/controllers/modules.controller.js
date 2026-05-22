"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.list = list;
exports.create = create;
exports.update = update;
exports.complete = complete;
exports.remove = remove;
const svc = __importStar(require("../services/modules.service"));
const module_validator_1 = require("../validators/module.validator");
const error_middleware_1 = require("../middleware/error.middleware");
async function list(req, res) {
    const modules = await svc.listModules(String(req.params.courseId));
    res.json({ success: true, data: modules });
}
async function create(req, res) {
    const parsed = module_validator_1.createModuleSchema.safeParse(req.body);
    if (!parsed.success)
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    const mod = await svc.createModule(String(req.params.courseId), parsed.data);
    res.status(201).json({ success: true, data: mod });
}
async function update(req, res) {
    const parsed = module_validator_1.updateModuleSchema.safeParse(req.body);
    if (!parsed.success)
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    const mod = await svc.updateModule(String(req.params.id), parsed.data);
    res.json({ success: true, data: mod });
}
async function complete(req, res) {
    const modules = await svc.completeModule(String(req.params.id), req.user.userId);
    res.json({ success: true, data: modules, message: 'Module completed — quiz released for learners' });
}
async function remove(req, res) {
    await svc.deleteModule(String(req.params.id));
    res.json({ success: true, message: 'Module deleted' });
}
//# sourceMappingURL=modules.controller.js.map