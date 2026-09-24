import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SenderService } from './sender.service.js';

const createSenderSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(255),
  fromEmail: z.string().email('Valid from email is required').max(255),
  fromName: z.string().min(1, 'From name is required').max(255),
  smtpHost: z.string().min(1, 'SMTP host is required').max(255),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecure: z.boolean().default(false),
  smtpUsername: z.string().min(1, 'SMTP username is required'),
  smtpPassword: z.string().min(1, 'SMTP password is required'),
  hourlyLimit: z.coerce.number().int().min(1).max(10000).optional(),
  minimumDelayMs: z.coerce.number().int().min(0).max(60000).optional(),
});

export class SenderController {
  public static async listSenders(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const activeOnly = req.query.active === 'true';
      const senders = await SenderService.listSenders(userId, activeOnly);
      res.json(senders);
    } catch (err) {
      next(err);
    }
  }

  public static async createSender(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const validatedData = createSenderSchema.parse(req.body);

      const sender = await SenderService.createSender(userId, validatedData);
      res.status(201).json(sender);
    } catch (err) {
      next(err);
    }
  }

  public static async updateSender(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const senderId = req.params.id as string;
      const updateSenderSchema = createSenderSchema.partial().extend({
        isActive: z.boolean().optional(),
      });
      const validatedData = updateSenderSchema.parse(req.body);

      const updated = await SenderService.updateSender(userId, senderId, validatedData);
      if (!updated) {
        res.status(404).json({ error: { message: 'Sender not found', code: 'NOT_FOUND' } });
        return;
      }
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }

  public static async toggleActive(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const senderId = req.params.id as string;
      const updated = await SenderService.toggleSenderActive(userId, senderId);
      if (!updated) {
        res.status(404).json({ error: { message: 'Sender not found', code: 'NOT_FOUND' } });
        return;
      }
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
}
