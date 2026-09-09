
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
// @ts-ignore: allow missing type declarations for sns-validator
import SNSValidator from "sns-validator";
import { randomUUID } from "node:crypto";

function extractRecipients(obj: any): string[] {
	if (!obj) return [];
	if (Array.isArray(obj.recipients) && obj.recipients.length) return obj.recipients;
	if (Array.isArray(obj.to) && obj.to.length) return obj.to;
	if (obj.recipient) return [obj.recipient].filter(Boolean);
	if (obj.email) return [obj.email].filter(Boolean);
	// SES structure
	if (obj.mail && Array.isArray(obj.mail?.destination)) return obj.mail.destination;
	if (obj.bounce && Array.isArray(obj.bounce?.bouncedRecipients)) return obj.bounce.bouncedRecipients.map((r: any) => r.emailAddress).filter(Boolean);
	return [];
}

function extractMessageId(obj: any): string | null {
	if (!obj) return null;
	return obj.messageId ?? obj.id ?? obj.message_id ?? obj.msg_id ?? obj.smtpId ?? obj.mail?.messageId ?? obj.mail?.MessageId ?? null;
}

function extractEventType(obj: any, provider: string): string {
	if (!obj) return "unknown";
	if (obj.event) return obj.event;
	if (obj.type) return obj.type;
	if (obj.notificationType) return obj.notificationType;
	if (provider === "sendgrid" && obj.event) return obj.event;
	return "unknown";
}

export async function handleSuppression(logger: any, dbApi: any, recipients: string[], eventType: string, ev: any) {
	for (const r of recipients) {
		try {
			await dbApi.upsertEmailSuppression(r, eventType, ev);
			await dbApi.markEmailJobSuppressedByRecipient(r, eventType, ev);
		} catch (err) {
			logger.error({ err, recipient: r }, "suppression handling failed");
		}
	}
}

export function createApp(opts: { snsValidator?: any; dbOverrides?: any; logger?: any } = {}) {
	const app = Fastify({ logger: opts.logger ?? true });
	const snsValidator = opts.snsValidator ?? new (SNSValidator as any)();

	// Lazily resolve DB helpers only when needed. Tests can inject `dbOverrides` to avoid
	// requiring the local `@job-hunter/db` package at module-import time.
	let resolvedDbApi: any | null = null;
	async function getDbApi() {
		if (opts.dbOverrides) return opts.dbOverrides;
		if (resolvedDbApi) return resolvedDbApi;
		const m = await import("@job-hunter/db");
		resolvedDbApi = {
			insertEmailEvent: m.insertEmailEvent,
			findEmailJobByProviderMessageId: m.findEmailJobByProviderMessageId,
			markEmailJobSuppressedByRecipient: m.markEmailJobSuppressedByRecipient,
			markEmailJobFailed: m.markEmailJobFailed,
			markEmailJobSent: m.markEmailJobSent,
			upsertEmailSuppression: m.upsertEmailSuppression,
		};
		return resolvedDbApi;
	}

	  app.get("/health", async () => ({ ok: true, service: "job-hunter-api" }));

	async function processSingleEvent(provider: string, ev: any) {
		const dbApi = await getDbApi();

		const providerMessageId = extractMessageId(ev);
		const recipients = extractRecipients(ev);
		const eventType = extractEventType(ev, provider);

		const eventId = `evt:${provider}:${providerMessageId ?? Date.now()}:${randomUUID()}`;
		let emailJobId: string | null = null;
		try {
			if (providerMessageId) emailJobId = await dbApi.findEmailJobByProviderMessageId(providerMessageId);
		} catch (err) {
			app.log.error({ err }, "findEmailJobByProviderMessageId failed");
		}

		try {
			await dbApi.insertEmailEvent({ id: eventId, emailJobId: emailJobId ?? null, providerEventType: eventType, providerPayload: ev });
		} catch (err) {
			app.log.error({ err }, "insertEmailEvent failed");
		}

		// Handle bounce/complaint/dropped -> suppression
		const suppressing = ["bounce", "bounced", "complaint", "dropped", "failed", "permanent_failure", "bounced"].includes((eventType || "").toString().toLowerCase());
		const delivered = ["delivered", "delivery", "accepted"].includes((eventType || "").toString().toLowerCase());

		if (suppressing && recipients.length > 0) {
			await handleSuppression(app.log, dbApi, recipients, eventType, ev);
		}

		if (emailJobId) {
			try {
				if (suppressing) {
					await dbApi.markEmailJobFailed(emailJobId, `provider_event:${eventType}`);
				} else if (delivered) {
					await dbApi.markEmailJobSent(emailJobId, providerMessageId ?? undefined);
				} else {
					// record other events as events only
				}
			} catch (err) {
				app.log.error({ err, emailJobId }, "failed to update email job state");
			}
		}

  
	}

	async function handleSesEnvelope(payload: any, reply: any) {
		try {
			await new Promise((resolve, reject) => {
				snsValidator.validate(payload, (err: any, msg: any) => {
					if (err) return reject(err);
					return resolve(msg);
				});
			});
		} catch (err) {
			app.log.error({ err }, "SNS signature validation failed");
			await reply.status(403).send({ ok: false, error: "invalid signature" });
			return true;
		}

		// Handle subscription confirmation
		if (payload.Type === "SubscriptionConfirmation" && payload.SubscribeURL) {
			try {
				await fetch(payload.SubscribeURL);
			} catch (err) {
				app.log.error({ err }, "failed to confirm SNS subscription");
			}
			await reply.send({ ok: true });
			return true;
		}

		// Unwrap Notification message
		if (payload.Type === "Notification" && payload.Message) {
			try {
				const msg = JSON.parse(payload.Message);
				await processSingleEvent("ses", msg);
				await reply.send({ ok: true });
			} catch (err) {
				app.log.error({ err }, "failed to process SES notification");
				await reply.status(500).send({ ok: false });
			}
			return true;
		}

		return false;
	}

	app.post<{ Params: { provider: string } }>("/webhooks/:provider", async (req: FastifyRequest<{ Params: { provider: string } }>, reply) => {
		const provider = req.params.provider;
		const payload: any = req.body;
		// SES messages come via SNS envelope; validate signature and unwrap
		if (provider === "ses") {
			const handled = await handleSesEnvelope(payload, reply);
			if (handled) return;
		}

		try {
			const events: any[] = [];
			if (Array.isArray(payload)) {
				events.push(...payload);
			} else if (payload && typeof payload === "object") {
				if (Array.isArray(payload.events)) events.push(...payload.events);
				else if (Array.isArray(payload.Records)) events.push(...payload.Records);
				else events.push(payload);
			}

			for (const ev of events) await processSingleEvent(provider, ev);
		} catch (err) {
			app.log.error({ err }, "webhook processing error");
			return reply.status(500).send({ ok: false });
		}

		return reply.send({ ok: true });
	});

	return app;
}

const defaultApp = createApp();
export default defaultApp;

if (process.env.NODE_ENV !== "test") {
	await defaultApp.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
}
