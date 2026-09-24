import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { redis } from '../../infrastructure/redis/redis.js';
import { AppError } from '../../middleware/error.middleware.js';
import { ErrorCode, type UserDto } from '../../types/index.js';

export class AuthService {
  private static oauthClient = new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_CALLBACK_URL,
  );

  public static async generateGoogleAuthUrl(): Promise<{ url: string; state: string }> {
    const state = crypto.randomBytes(32).toString('hex');
    await redis.set(`oauth:v1:google:${state}`, 'pending', 'EX', 600); // 10 min TTL

    const url = this.oauthClient.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      state,
      prompt: 'select_account',
    });

    return { url, state };
  }

  public static async handleGoogleCallback(
    code: string,
    state: string,
  ): Promise<{ sessionId: string; user: UserDto }> {
    // 1. Verify CSRF state token
    const storedState = await redis.get(`oauth:v1:google:${state}`);
    if (!storedState) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Invalid or expired OAuth state');
    }
    await redis.del(`oauth:v1:google:${state}`);

    // 2. Exchange authorization code for tokens
    const { tokens } = await this.oauthClient.getToken(code);
    if (!tokens.id_token) {
      throw new AppError(400, ErrorCode.UNAUTHORIZED, 'Failed to obtain Google ID Token');
    }

    // 3. Verify ID Token
    const ticket = await this.oauthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      throw new AppError(400, ErrorCode.UNAUTHORIZED, 'Invalid Google ID Token payload');
    }

    // 4. Upsert user in MySQL
    const user = await prisma.user.upsert({
      where: { googleSub: payload.sub },
      update: {
        email: payload.email,
        name: payload.name || payload.email.split('@')[0] || 'User',
        avatarUrl: payload.picture || null,
      },
      create: {
        googleSub: payload.sub,
        email: payload.email,
        name: payload.name || payload.email.split('@')[0] || 'User',
        avatarUrl: payload.picture || null,
      },
    });

    // 5. Create secure session in Redis
    const sessionId = uuidv4();
    const sessionData: UserDto = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
    };

    await redis.set(
      `session:v1:${sessionId}`,
      JSON.stringify(sessionData),
      'EX',
      env.SESSION_TTL_SECONDS,
    );

    return { sessionId, user: sessionData };
  }

  public static async devLogin(email = 'olivia@reachinbox.io', name = 'Olivia Lee'): Promise<{ sessionId: string; user: UserDto }> {
    const user = await prisma.user.upsert({
      where: { email },
      update: { name },
      create: {
        googleSub: `dev_${email}`,
        email,
        name,
        avatarUrl: null,
      },
    });

    const sessionId = uuidv4();
    const sessionData: UserDto = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
    };

    await redis.set(
      `session:v1:${sessionId}`,
      JSON.stringify(sessionData),
      'EX',
      env.SESSION_TTL_SECONDS,
    );

    return { sessionId, user: sessionData };
  }

  public static async destroySession(sessionId: string): Promise<void> {
    await redis.del(`session:v1:${sessionId}`);
  }
}
