import { Request, Response, NextFunction } from 'express';
import { SearchService } from './search.service.js';

export class SearchController {
  public static async searchEmails(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const q = req.query.q as string | undefined;
      const status = req.query.status as string | undefined;
      const senderId = req.query.senderId as string | undefined;
      const campaignId = req.query.campaignId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const results = await SearchService.searchEmails({
        userId,
        q,
        status,
        senderId,
        campaignId,
        limit,
      });

      res.json(results);
    } catch (err) {
      next(err);
    }
  }
}
