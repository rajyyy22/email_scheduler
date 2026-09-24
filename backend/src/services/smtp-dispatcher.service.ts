import nodemailer, { Transporter } from 'nodemailer';

export type SmtpErrorClassification = 'TRANSIENT' | 'PERMANENT' | 'UNKNOWN';

export interface SmtpSendResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string | null;
  error?: {
    code: string;
    message: string;
    classification: SmtpErrorClassification;
  };
}

export class SmtpDispatcherService {
  private static transports = new Map<string, Transporter>();
  private static transportConfigs = new Map<string, string>();

  /**
   * Returns or creates a cached Nodemailer transporter for the given sender.
   * Automatically invalidates and recreates if credentials or host config change.
   */
  public static getTransporter(
    senderId: string,
    config: {
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
    },
  ): Transporter {
    const configHash = `${config.host}:${config.port}:${config.secure}:${config.user}:${config.pass}`;
    const existingHash = this.transportConfigs.get(senderId);

    if (!this.transports.has(senderId) || existingHash !== configHash) {
      if (this.transports.has(senderId)) {
        try {
          this.transports.get(senderId)?.close();
        } catch {
          // ignore cleanup errors
        }
      }

      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.pass,
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
      });

      this.transports.set(senderId, transporter);
      this.transportConfigs.set(senderId, configHash);
    }

    return this.transports.get(senderId)!;
  }

  /**
   * Classifies an SMTP failure into TRANSIENT, PERMANENT, or UNKNOWN.
   */
  public static classifyError(err: any): { code: string; message: string; classification: SmtpErrorClassification } {
    const code = err.code || err.responseCode?.toString() || 'SMTP_UNKNOWN_ERROR';
    const message = err.message || 'Unknown SMTP error occurred';

    // Transient network or temporary server errors
    const transientCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ESOCKETTIMEDOUT', 'ENOTFOUND'];
    if (transientCodes.includes(code)) {
      return { code, message, classification: 'TRANSIENT' };
    }

    if (err.responseCode && typeof err.responseCode === 'number') {
      if (err.responseCode >= 400 && err.responseCode < 500) {
        return { code: `SMTP_${err.responseCode}`, message, classification: 'TRANSIENT' };
      }
      if (err.responseCode >= 500 && err.responseCode < 600) {
        return { code: `SMTP_${err.responseCode}`, message, classification: 'PERMANENT' };
      }
    }

    // Default to unknown if response is ambiguous
    return { code, message, classification: 'UNKNOWN' };
  }

  /**
   * Sends an email via Nodemailer and resolves delivery metadata or classified error.
   */
  public static async sendMail(
    senderId: string,
    senderConfig: {
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
      fromName: string;
      fromEmail: string;
    },
    mailOptions: {
      to: string;
      subject: string;
      body: string;
    },
  ): Promise<SmtpSendResult> {
    const transporter = this.getTransporter(senderId, {
      host: senderConfig.host,
      port: senderConfig.port,
      secure: senderConfig.secure,
      user: senderConfig.user,
      pass: senderConfig.pass,
    });

    try {
      const info = await transporter.sendMail({
        from: `"${senderConfig.fromName}" <${senderConfig.fromEmail}>`,
        to: mailOptions.to,
        subject: mailOptions.subject,
        text: mailOptions.body,
        html: mailOptions.body.replace(/\n/g, '<br/>'),
      });

      const previewUrl = nodemailer.getTestMessageUrl(info);

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: previewUrl ? previewUrl.toString() : null,
      };
    } catch (err: any) {
      const classified = this.classifyError(err);
      return {
        success: false,
        error: classified,
      };
    }
  }
}
