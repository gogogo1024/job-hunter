import type { Mailer, MailOptions } from "./mailer.js";

const RESEND_API = "https://api.resend.com/emails";

export class ResendMailer implements Mailer {
  key: string;
  constructor() {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not configured");
    this.key = key;
  }

  async sendMail(to: string | string[], subject: string, text?: string, html?: string, opts?: MailOptions) {
    const recipients = Array.isArray(to) ? to : [to];
    const body: any = {
      from: process.env.EMAIL_FROM || "no-reply@job-hunter.local",
      to: recipients,
      subject,
      text,
      html,
    };

    if (opts?.headers) body.headers = opts.headers;

    if (opts?.attachments && opts.attachments.length) {
      body.attachments = opts.attachments.map((a) => ({
        name: a.filename,
        data: a.content, // already base64 encoded by enqueueer
        type: a.contentType || "application/octet-stream",
      }));
    }

    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`resend send failed ${res.status}: ${txt}`);
    }

    const payload = await res.json();
    return { messageId: payload.id ?? payload.messageId };
  }
}
