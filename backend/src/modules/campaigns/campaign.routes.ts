import { Router } from 'express';
import { CampaignController, upload } from './campaign.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { idempotencyMiddleware } from '../../middleware/idempotency.middleware.js';

export const campaignRouter: Router = Router();

campaignRouter.use(authMiddleware);

campaignRouter.post(
  '/',
  upload.single('file'),
  idempotencyMiddleware(),
  CampaignController.createCampaign,
);

campaignRouter.get('/', CampaignController.listCampaigns);
campaignRouter.get('/:id', CampaignController.getCampaignById);
