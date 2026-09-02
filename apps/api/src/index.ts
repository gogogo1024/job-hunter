import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true, service: "job-hunter-api" }));

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
