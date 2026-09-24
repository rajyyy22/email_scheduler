import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

export const authRouter: Router = Router();

authRouter.get('/google', AuthController.googleRedirect);
authRouter.get('/google/callback', AuthController.googleCallback);
authRouter.post('/dev-login', AuthController.devLogin);
authRouter.get('/me', authMiddleware, AuthController.getMe);
authRouter.post('/logout', authMiddleware, AuthController.logout);
