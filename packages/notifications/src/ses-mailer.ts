import type { Mailer, MailOptions } from "./mailer.js";
import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { randomUUID } from "node:crypto";

export class SesMailer implements Mailer {
  client: SESClient;
  from: string;
  constructor() {
    const region = process.env.SES_REGION ?? process.env.AWS_REGION;
    if (!region) throw new Error("SES region not configured (set SES_REGION or AWS_REGION)");
    this.client = new SESClient({ region });
    this.from = process.env.EMAIL_FROM ?? `no-reply@job-hunter.local`;
  }

  buildRawEmail(
    to: string | string[],
    subject: string,
    text?: string,
    html?: string,
    attachments?: MailOptions["attachments"],
    from?: string,
  ) {
    const boundaryOuter = `--outer_${Date.now()}_${randomUUID()}`;
    const boundaryInner = `--inner_${Date.now()}_${randomUUID()}`;
    const toList = Array.isArray(to) ? to.join(", ") : String(to);
    const header = [
      `From: ${from ?? this.from}`,
      `To: ${toList}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundaryOuter}"`,
      "",
    ].join("\r\n");

    const alternativeStart = [
      `--${boundaryOuter}`,
      `Content-Type: multipart/alternative; boundary="${boundaryInner}"`,
      "",
    ].join("\r\n");

    const parts: string[] = [];
    if (text) {
      parts.push([
        `--${boundaryInner}`,
        "Content-Type: text/plain; charset=\"utf-8\"",
        "Content-Transfer-Encoding: 7bit",
        "",
        text,
        "",
      ].join("\r\n"));
    }

    if (html) {
      parts.push([
        `--${boundaryInner}`,
        "Content-Type: text/html; charset=\"utf-8\"",
        "Content-Transfer-Encoding: 7bit",
        "",
        html,
        "",
      ].join("\r\n"));
    }

    const alternativeEnd = [`--${boundaryInner}--`, ""].join("\r\n");

    const attachmentBlocks: string[] = [];
    if (attachments?.length) {
      for (const a of attachments) {
        const filename = a.filename;
        const contentType = a.contentType ?? "application/octet-stream";
        const contentBase64 = typeof a.content === "string" ? a.content : Buffer.from(a.content).toString("base64");
        attachmentBlocks.push([
          `--${boundaryOuter}`,
          `Content-Type: ${contentType}; name="${filename}"`,
          `Content-Disposition: attachment; filename="${filename}"`,
          "Content-Transfer-Encoding: base64",
          "",
          contentBase64,
          "",
        ].join("\r\n"));
      }
    }

    const footer = `--${boundaryOuter}--`;

    return [header, alternativeStart, parts.join("\r\n"), alternativeEnd, attachmentBlocks.join("\r\n"), footer].join("\r\n");
  }

  async sendMail(to: string | string[], subject: string, text?: string, html?: string, opts?: MailOptions) {
    const raw = this.buildRawEmail(to, subject, text ?? "", html ?? "", opts?.attachments ?? [], this.from);
    const cmd = new SendRawEmailCommand({ RawMessage: { Data: Buffer.from(raw) }, Source: this.from });
    const res = await this.client.send(cmd);
    return { messageId: (res.MessageId as string) ?? undefined };
  }
}

export default SesMailer;
