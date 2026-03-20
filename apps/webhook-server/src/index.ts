import "dotenv-safe/config.js";

import express from "express";
import pino from "pino";
import pinoHttp from "pino-http";

import { healthRoute } from "./routes/health.js";
import { gitLabWebhookRoute } from "./routes/gitlab-webhook.js";
import { mcpRoute } from "./routes/mcp.js";
import { verifyGitLabSignature } from "./middleware/verify-signature.js";

const logger = pino({ name: "vorth-webhook-server" });
const app = express();
const httpLogger = pinoHttp as unknown as (options: { logger: pino.Logger }) => express.RequestHandler;

app.use(express.json({ limit: "2mb" }));
app.use(httpLogger({ logger }));

app.get("/health", healthRoute);
app.post("/webhook/gitlab", verifyGitLabSignature, gitLabWebhookRoute);
app.post("/webhook/vorth-run", gitLabWebhookRoute);
app.post("/mcp", mcpRoute);

const port = Number.parseInt(process.env.WEBHOOK_SERVER_PORT ?? "3001", 10);

app.listen(port, () => {
  logger.info({ port }, "vorth webhook server listening");
});
