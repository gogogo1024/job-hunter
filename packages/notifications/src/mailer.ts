export interface MailOptions {
  cc?: string[];
  bcc?: string[];
  headers?: Record<string, string>;
  attachments?: Array<{
    filename: string;
    // base64 encoded string
    content: string;
    contentType?: string;
  }>;
}

export interface Mailer {
  sendMail(
    to: string | string[],
    subject: string,
    text?: string,
    html?: string,
    opts?: MailOptions,
  ): Promise<{ messageId?: string } | void>;
}

// ensure crypto import is available to files that use randomUUID via global import
import crypto from "crypto";

export type EmailJob = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: MailOptions["attachments"];
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
};
