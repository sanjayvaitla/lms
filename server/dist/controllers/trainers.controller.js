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
exports.listTrainers = listTrainers;
exports.getTrainer = getTrainer;
exports.createTrainer = createTrainer;
exports.updateTrainer = updateTrainer;
exports.deleteTrainer = deleteTrainer;
const trainersService = __importStar(require("../services/trainers.service"));
const trainer_validator_1 = require("../validators/trainer.validator");
const error_middleware_1 = require("../middleware/error.middleware");
async function listTrainers(_req, res) {
    const trainers = await trainersService.listTrainers();
    res.json({ success: true, data: trainers });
}
async function getTrainer(req, res) {
    const trainer = await trainersService.getTrainer(String(req.params.id));
    res.json({ success: true, data: trainer });
}
async function createTrainer(req, res) {
    const parsed = trainer_validator_1.createTrainerSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    }
    const trainer = await trainersService.createTrainer(parsed.data);
    res.status(201).json({ success: true, data: trainer });
}
async function updateTrainer(req, res) {
    const parsed = trainer_validator_1.updateTrainerSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    }
    const trainer = await trainersService.updateTrainer(String(req.params.id), parsed.data);
    res.json({ success: true, data: trainer });
}
async function deleteTrainer(req, res) {
    await trainersService.deleteTrainer(String(req.params.id));
    res.json({ success: true, message: 'Trainer deleted successfully' });
}
//# sourceMappingURL=trainers.controller.js.map