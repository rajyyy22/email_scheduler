import { Router } from 'express';
import { SlackController } from './slack.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

export const slackRouter: Router = Router();

slackRouter.get('/callback', SlackController.handleCallback); // Public callback invoked by Slack
slackRouter.get('/', authMiddleware, SlackController.getSlackStatus);
slackRouter.get('/connect', authMiddleware, SlackController.connectSlack);
slackRouter.delete('/', authMiddleware, SlackController.disconnectSlack);
