import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { env } from '../../config/env.js';
import { SESSION_COOKIE_NAME } from '../../middleware/auth.middleware.js';

export class AuthController {
  public static async googleRedirect(
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { url } = await AuthService.generateGoogleAuthUrl();
      res.redirect(url);
    } catch (err) {
      next(err);
    }
  }

  public static async googleCallback(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;

      if (!code || !state) {
        res.redirect(`${env.FRONTEND_URL}/?error=missing_oauth_params`);
        return;
      }

      const { sessionId } = await AuthService.handleGoogleCallback(code, state);

      // Set secure HTTP-only session cookie
      res.cookie(SESSION_COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: env.SESSION_TTL_SECONDS * 1000,
        path: '/',
      });

      const frontendBase = env.FRONTEND_URL.replace(/\/+$/, '');
      res.redirect(`${frontendBase}/?token=${sessionId}`);
    } catch (err) {
      console.error('Google OAuth callback error:', err);
      res.redirect(`${env.FRONTEND_URL}/?error=auth_failed`);
    }
  }

  public static async getMe(req: Request, res: Response): Promise<void> {
    res.json({ user: req.user });
  }

  public static async logout(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
      if (sessionId) {
        await AuthService.destroySession(sessionId);
      }
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  public static async devLogin(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const email = (req.body?.email as string) || 'olivia@reachinbox.io';
      const name = (req.body?.name as string) || 'Olivia Lee';

      const { sessionId, user } = await AuthService.devLogin(email, name);

      res.cookie(SESSION_COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: env.SESSION_TTL_SECONDS * 1000,
        path: '/',
      });

      res.json({ success: true, user, sessionId });
    } catch (err) {
      next(err);
    }
  }
}
