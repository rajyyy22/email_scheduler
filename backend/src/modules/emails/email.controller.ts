import { Request, Response, NextFunction } from 'express';
import { EmailService } from './email.service.js';
import { AppError } from '../../middleware/error.middleware.js';
import { ErrorCode } from '../../types/index.js';

export class EmailController {
  public static async listEmails(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const view = (req.query.view as 'scheduled' | 'sent') || 'scheduled';
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const cursor = req.query.cursor as string | undefined;

      if (view !== 'scheduled' && view !== 'sent') {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'View must be "scheduled" or "sent"');
      }

      const result = await EmailService.listEmails(userId, view, limit, cursor);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  public static async getEmailById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const emailId = req.params.id as string;
      const email = await EmailService.getEmailById(userId, emailId);

      if (!email) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'Email not found');
      }

      res.json(email);
    } catch (err) {
      next(err);
    }
  }

  public static async retryEmail(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const emailId = req.params.id as string;
      await EmailService.retryEmail(userId, emailId);
      res.json({ success: true, message: 'Email scheduled for retry' });
    } catch (err) {
      next(err);
    }
  }
}
