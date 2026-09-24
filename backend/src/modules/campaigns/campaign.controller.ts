import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { CsvParserService } from './csv-parser.service.js';
import { CampaignService } from './campaign.service.js';
import { AppError } from '../../middleware/error.middleware.js';
import { env } from '../../config/env.js';
import { ErrorCode } from '../../types/index.js';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_CSV_SIZE_BYTES, // 5MB
  },
});

const campaignBodySchema = z.object({
  senderId: z.string().uuid('Valid senderId UUID is required'),
  subject: z.string().min(1, 'Subject is required').max(env.MAX_SUBJECT_LENGTH),
  body: z.string().min(1, 'Body is required').max(env.MAX_BODY_LENGTH),
  startAt: z.string().datetime({ message: 'startAt must be a valid ISO-8601 UTC timestamp' }),
  minimumDelayMs: z.coerce.number().int().min(0).max(60000).optional(),
  hourlyLimit: z.coerce.number().int().min(1).max(10000).optional(),
  recipients: z.array(z.string()).optional(),
});

export class CampaignController {
  public static async createCampaign(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const file = req.file;

      // Parse and validate form fields
      const validatedData = campaignBodySchema.parse(req.body);

      let parseResult: {
        validEmails: string[];
        totalDetected: number;
        validCount: number;
        invalidCount: number;
        duplicatesRemoved: number;
      };

      if (file) {
        parseResult = await CsvParserService.parseCsv(file.buffer);
      } else if (validatedData.recipients && validatedData.recipients.length > 0) {
        parseResult = CsvParserService.normalizeEmailList(validatedData.recipients);
      } else {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'Either a CSV file or a recipients list must be provided',
        );
      }

      const result = await CampaignService.createCampaign(
        userId,
        validatedData,
        parseResult.validEmails,
        {
          totalDetected: parseResult.totalDetected,
          invalidCount: parseResult.invalidCount,
          duplicatesRemoved: parseResult.duplicatesRemoved,
        },
      );

      // Return 202 Accepted for asynchronous queue processing
      res.status(202).json({
        message: 'Campaign accepted for scheduling and processing',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async listCampaigns(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const campaigns = await CampaignService.listCampaigns(userId);
      res.json(campaigns);
    } catch (err) {
      next(err);
    }
  }

  public static async getCampaignById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const campaignId = req.params.id as string;
      const campaign = await CampaignService.getCampaignById(userId, campaignId);

      if (!campaign) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'Campaign not found');
      }

      res.json(campaign);
    } catch (err) {
      next(err);
    }
  }
}
