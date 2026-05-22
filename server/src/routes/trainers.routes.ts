import { Router, IRouter } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/trainers.controller';

const router: IRouter = Router();

router.use(authenticate);

router.get('/',       ctrl.listTrainers);
router.get('/:id',    ctrl.getTrainer);
router.post('/',      ctrl.createTrainer);
router.put('/:id',    ctrl.updateTrainer);
router.delete('/:id', ctrl.deleteTrainer);

export default router;
