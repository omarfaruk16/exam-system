import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Env } from '../config/env.validation';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.from = config.get('MAIL_FROM', { infer: true });
    this.appUrl = config.get('WEB_APP_URL', { infer: true });
    const host = config.get('SMTP_HOST', { infer: true });

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: config.get('SMTP_PORT', { infer: true }),
        secure: config.get('SMTP_SECURE', { infer: true }),
        auth: {
          user: config.get('SMTP_USER', { infer: true }),
          pass: config.get('SMTP_PASS', { infer: true }),
        },
      });
    } else {
      this.transporter = null;
    }
  }

  async sendPasswordReset(to: string, token: string, displayName: string): Promise<void> {
    const link = `${this.appUrl}/reset-password?token=${token}`;
    const subject = 'Reset your password';
    const html = `
      <p>Hi ${displayName},</p>
      <p>We received a request to reset your password. Click the link below to set a new password:</p>
      <p><a href="${link}" style="color:#1E3A5F;font-weight:bold;">Reset my password</a></p>
      <p>This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.</p>
      <p>— University Examination System</p>
    `;

    if (this.transporter) {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
    } else {
      this.logger.log(`[DEV — no SMTP configured] Password reset link for ${to}: ${link}`);
    }
  }
}
