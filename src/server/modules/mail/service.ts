import nodemailer from "nodemailer";
import type { SmtpConfig } from "../../config.js";

export class MailService {
  private readonly transporter: nodemailer.Transporter | null;

  constructor(private readonly smtp?: SmtpConfig) {
    this.transporter = smtp
      ? nodemailer.createTransport({
          host: smtp.host,
          port: smtp.port,
          secure: smtp.port === 465,
          auth:
            smtp.user && smtp.pass
              ? { user: smtp.user, pass: smtp.pass }
              : undefined,
        })
      : null;
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  /** Send an arbitrary email through the configured SMTP transport. */
  async send(input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<void> {
    if (!this.transporter || !this.smtp) {
      throw new Error("SMTP is not configured");
    }
    await this.transporter.sendMail({
      from: this.smtp.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  }

  async sendPasswordResetEmail(input: {
    to: string;
    resetUrl: string;
  }): Promise<void> {
    return this.send({
      to: input.to,
      subject: "Reset your Feylore password",
      text: `Use this link to reset your password (valid for 1 hour):\n\n${input.resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use this link to reset your password (valid for 1 hour):</p><p><a href="${input.resetUrl}">${input.resetUrl}</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });
  }
}
