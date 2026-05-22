import type { CreateModuleInput, UpdateModuleInput } from '../validators/module.validator';
export declare function listModules(courseId: string): Promise<any[]>;
export declare function createModule(courseId: string, input: CreateModuleInput): Promise<any>;
export declare function updateModule(moduleId: string, input: UpdateModuleInput): Promise<any>;
/** Trainer marks module complete → unlocks quiz for that module; releases next module */
export declare function completeModule(moduleId: string, userId: string): Promise<any[]>;
export declare function deleteModule(moduleId: string): Promise<void>;
//# sourceMappingURL=modules.service.d.ts.map