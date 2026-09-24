import { Router } from 'express';
import { EmailController } from './email.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

export const emailRouter: Router = Router();

emailRouter.use(authMiddleware);

emailRouter.get('/', EmailController.listEmails);
emailRouter.get('/:id', EmailController.getEmailById);
emailRouter.post('/:id/retry', EmailController.retryEmail);
