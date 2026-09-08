import type { Mailer } from "./mailer.js";

export class NoopMailer implements Mailer {
  async sendMail() {
    // no-op: used when no provider configured in env
    console.warn("No mailer configured; drop sendMail call");
    return;
  }
}
