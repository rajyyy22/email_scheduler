import { Router } from 'express';
import { SearchController } from './search.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

export const searchRouter: Router = Router();

searchRouter.use(authMiddleware);

searchRouter.get('/emails', SearchController.searchEmails);
