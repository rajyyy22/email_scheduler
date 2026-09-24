import { Request, Response, NextFunction } from 'express';
import { SlackService } from './slack.service.js';
import { env } from '../../config/env.js';

export class SlackController {
  public static async getSlackStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const status = await SlackService.getSlackStatus(userId);
      res.json(status);
    } catch (err) {
      next(err);
    }
  }

  public static async connectSlack(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const url = await SlackService.generateSlackConnectUrl(userId);
      res.redirect(url);
    } catch (err) {
      next(err);
    }
  }

  public static async handleCallback(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;

      if (!code || !state) {
        res.redirect(`${env.FRONTEND_URL}/?slack=error`);
        return;
      }

      await SlackService.handleSlackCallback(code, state);
      res.redirect(`${env.FRONTEND_URL}/?slack=connected`);
    } catch (err) {
      console.error('Slack OAuth callback error:', err);
      res.redirect(`${env.FRONTEND_URL}/?slack=error`);
    }
  }

  public static async disconnectSlack(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      await SlackService.disconnectSlack(userId);
      res.json({ success: true, message: 'Slack integration disconnected' });
    } catch (err) {
      next(err);
    }
  }
}
