import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { AI_BRIEFING_API_ENDPOINT, AiBriefingConfigurationError, type AiBriefingRequestPayload } from "./src/lib/ai-briefing";
import { generateOpenAiBriefing } from "./src/lib/ai-briefing-server";

const MAX_AI_BRIEFING_REQUEST_BYTES = 64_000;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [aiBriefingApiPlugin(env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY)],
  };
});

function aiBriefingApiPlugin(apiKey: string | undefined): Plugin {
  return {
    name: "global-crisis-observatory-ai-briefing-api",
    configureServer(server) {
      server.middlewares.use(AI_BRIEFING_API_ENDPOINT, (request, response) => {
        void handleAiBriefingApiRequest(request, response, apiKey);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(AI_BRIEFING_API_ENDPOINT, (request, response) => {
        void handleAiBriefingApiRequest(request, response, apiKey);
      });
    },
  };
}

async function handleAiBriefingApiRequest(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  apiKey: string | undefined,
): Promise<void> {
  if (request.method === "OPTIONS") {
    writeJson(response, 204, null);
    return;
  }

  if (request.method !== "POST") {
    writeJson(response, 405, { error: "AI Briefing requests must use POST.", code: "request" });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const payload = readAiBriefingPayload(body);
    const briefing = await generateOpenAiBriefing({ payload, apiKey });
    writeJson(response, 200, briefing);
  } catch (error) {
    const status = error instanceof AiBriefingConfigurationError ? 401 : 400;
    const code = error instanceof AiBriefingConfigurationError ? "configuration" : "request";
    const message = error instanceof Error ? error.message : "AI Briefing generation failed. The Global Crisis Dashboard remains interactive.";
    writeJson(response, status, { error: message, code });
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  let body = "";

  for await (const chunk of request) {
    body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    if (body.length > MAX_AI_BRIEFING_REQUEST_BYTES) {
      throw new Error("The AI Briefing request is too large.");
    }
  }

  if (body.trim() === "") {
    throw new Error("The AI Briefing request body is empty.");
  }

  return JSON.parse(body) as unknown;
}

function readAiBriefingPayload(value: unknown): AiBriefingRequestPayload {
  if (!isRecord(value) || !isRecord(value.payload)) {
    throw new Error("The AI Briefing request body is missing its payload.");
  }

  return value.payload as unknown as AiBriefingRequestPayload;
}

function writeJson(response: ServerResponse<IncomingMessage>, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(payload === null ? "" : JSON.stringify(payload));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
