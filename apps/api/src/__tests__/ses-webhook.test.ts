import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock SNS validator to always accept messages in tests
vi.mock("sns-validator", () => {
  return {
    default: class SNSValidator {
      validate(msg: any, cb: Function) {
        cb(null, msg);
      }
    },
  };
});
// Note: we will inject DB mocks via createApp({ dbOverrides }) in each test

beforeEach(() => {
  vi.clearAllMocks();
  // mock fetch used for subscription confirmation
  (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true });
});

describe("SES webhook", () => {
  it("processes a bounce notification and records suppression", async () => {
    // create local DB mocks and inject into app
    const insertEmailEvent = vi.fn();
    const upsertEmailSuppression = vi.fn();
    const markEmailJobSuppressedByRecipient = vi.fn();
    const findEmailJobByProviderMessageId = vi.fn().mockResolvedValue(null);
    const markEmailJobFailed = vi.fn();
    const markEmailJobSent = vi.fn();

    const message = {
      notificationType: "Bounce",
      mail: { messageId: "mail-1", destination: ["bounced@example.com"] },
      bounce: { bouncedRecipients: [{ emailAddress: "bounced@example.com" }] },
    };

    const envelope = {
      Type: "Notification",
      MessageId: "sns-1",
      Message: JSON.stringify(message),
      SigningCertURL: "https://sns.example/cert.pem",
      Signature: "fake",
      SignatureVersion: "1",
    };

    const { createApp } = await import("../index");
    const app = createApp({ dbOverrides: { insertEmailEvent, upsertEmailSuppression, markEmailJobSuppressedByRecipient, findEmailJobByProviderMessageId, markEmailJobFailed, markEmailJobSent }, logger: false });

    const res = await app.inject({ method: "POST", url: "/webhooks/ses", payload: envelope });
    expect(res.statusCode).toBe(200);
    expect(upsertEmailSuppression).toHaveBeenCalledWith("bounced@example.com", expect.any(String), expect.any(Object));
    expect(insertEmailEvent).toHaveBeenCalled();
  });

  it("handles subscription confirmation by fetching SubscribeURL", async () => {
    const insertEmailEvent = vi.fn();
    const upsertEmailSuppression = vi.fn();
    const markEmailJobSuppressedByRecipient = vi.fn();
    const findEmailJobByProviderMessageId = vi.fn().mockResolvedValue(null);
    const markEmailJobFailed = vi.fn();
    const markEmailJobSent = vi.fn();

    const envelope = {
      Type: "SubscriptionConfirmation",
      MessageId: "sns-sub-1",
      SubscribeURL: "https://sns.example/confirm",
      SigningCertURL: "https://sns.example/cert.pem",
      Signature: "fake",
      SignatureVersion: "1",
    };
    const { createApp } = await import("../index");
    const app = createApp({ dbOverrides: { insertEmailEvent, upsertEmailSuppression, markEmailJobSuppressedByRecipient, findEmailJobByProviderMessageId, markEmailJobFailed, markEmailJobSent }, logger: false });

    const res = await app.inject({ method: "POST", url: "/webhooks/ses", payload: envelope });
    expect(res.statusCode).toBe(200);
    expect((globalThis as any).fetch).toHaveBeenCalledWith("https://sns.example/confirm");
  });
});
