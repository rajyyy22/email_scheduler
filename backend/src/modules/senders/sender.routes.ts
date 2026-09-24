import { Router } from 'express';
import { SenderController } from './sender.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

export const senderRouter: Router = Router();

senderRouter.use(authMiddleware);

senderRouter.get('/', SenderController.listSenders);
senderRouter.post('/', SenderController.createSender);
senderRouter.put('/:id', SenderController.updateSender);
senderRouter.patch('/:id/toggle', SenderController.toggleActive);
