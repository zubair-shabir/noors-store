import { logger } from './logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSender {
  /** False when messages only go to the log (development without an email service). */
  readonly delivers: boolean;
  send(message: EmailMessage): Promise<void>;
}

/** Sends through Resend's HTTP API. */
export class ResendEmailSender implements EmailSender {
  readonly delivers = true;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, ...message, to: [message.to] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Resend rejected the email (${res.status}): ${await res.text()}`);
    }
  }
}

/** Development fallback: writes each email to the log instead of sending it. */
export class LogEmailSender implements EmailSender {
  readonly delivers = false;
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    if (this.sent.length > 50) this.sent.shift();
    logger.info({ to: message.to, subject: message.subject }, `Email (not sent):\n${message.text}`);
  }
}
