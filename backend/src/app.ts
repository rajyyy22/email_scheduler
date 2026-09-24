import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { setupBullBoard } from './queue/bull-board/bull-board.js';

import { authRouter } from './modules/auth/auth.routes.js';
import { senderRouter } from './modules/senders/sender.routes.js';
import { campaignRouter } from './modules/campaigns/campaign.routes.js';
import { emailRouter } from './modules/emails/email.routes.js';
import { searchRouter } from './modules/search/search.routes.js';
import { slackRouter } from './modules/slack/slack.routes.js';
import { healthRouter } from './modules/health/health.routes.js';

export function createApp(): Express {
  const app = express();

  // Basic security and parsing middlewares
  app.use(helmet({
    contentSecurityPolicy: false, // Allow Bull Board inline scripts/styles
  }));

  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'x-request-id'],
      exposedHeaders: ['x-request-id'],
    }),
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(requestIdMiddleware);

  // Health checks
  app.use('/health', healthRouter);

  // Bull Board queue dashboard (protected by auth middleware)
  const bullBoardRouter = setupBullBoard();
  app.use('/admin/queues', authMiddleware, bullBoardRouter);

  // API v1 Routes
  const apiV1Router = express.Router();
  apiV1Router.use('/auth', authRouter);
  apiV1Router.use('/senders', senderRouter);
  apiV1Router.use('/campaigns', campaignRouter);
  apiV1Router.use('/emails', emailRouter);
  apiV1Router.use('/search', searchRouter);
  apiV1Router.use('/integrations/slack', slackRouter);

  app.use('/api/v1', apiV1Router);

  // Standardized Error Middleware
  app.use(errorMiddleware);

  return app;
}
