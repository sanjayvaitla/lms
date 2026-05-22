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
exports.getById = getById;
exports.create = create;
exports.update = update;
exports.remove = remove;
exports.availableBatches = availableBatches;
exports.assignBatch = assignBatch;
exports.removeBatch = removeBatch;
exports.dashboardStats = dashboardStats;
const svc = __importStar(require("../services/learners.service"));
async function list(req, res) {
    const { search, page, limit } = req.query;
    const result = await svc.listLearners(search, page ? parseInt(page) : 1, limit ? parseInt(limit) : 20);
    res.json({ success: true, data: result });
}
async function getById(req, res) {
    const learner = await svc.getLearner(String(req.params.id));
    res.json({ success: true, data: learner });
}
async function create(req, res) {
    const learner = await svc.createLearner(req.body);
    res.status(201).json({ success: true, data: learner });
}
async function update(req, res) {
    const learner = await svc.updateLearner(String(req.params.id), req.body);
    res.json({ success: true, data: learner });
}
async function remove(req, res) {
    await svc.deleteLearner(String(req.params.id));
    res.json({ success: true, message: 'Learner deleted' });
}
async function availableBatches(req, res) {
    const batches = await svc.getAvailableBatches(String(req.params.id));
    res.json({ success: true, data: batches });
}
async function assignBatch(req, res) {
    const { batchId } = req.body;
    const result = await svc.assignBatch(String(req.params.id), batchId);
    res.status(201).json({ success: true, data: result });
}
async function removeBatch(req, res) {
    await svc.removeBatch(String(req.params.id), String(req.params.batchId));
    res.json({ success: true, message: 'Removed from batch' });
}
async function dashboardStats(_req, res) {
    const stats = await svc.getDashboardStats();
    res.json({ success: true, data: stats });
}
//# sourceMappingURL=learners.controller.js.map