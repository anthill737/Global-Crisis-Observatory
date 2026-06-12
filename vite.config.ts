import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { AI_BRIEFING_API_ENDPOINT, AiBriefingConfigurationError, type AiBriefingRequestPayload } from "./src/lib/ai-briefing";
import { isAiBriefingChoice, type AiBriefingChoice } from "./src/lib/ai-briefing-choice";
import { generateProviderAiBriefing, type AiBriefingProviderApiKeys } from "./src/lib/ai-briefing-server";
import {
  GDACS_RSS_FEED_ENDPOINT,
  GDACS_RSS_PROXY_ENDPOINT,
  GDACS_RSS_REQUEST_HEADERS,
  NOAA_NWS_ACTIVE_ALERTS_ENDPOINT,
  NOAA_NWS_ALERTS_PROXY_ENDPOINT,
  NOAA_NWS_ALERTS_REQUEST_HEADERS,
} from "./src/lib/incidents";

const MAX_AI_BRIEFING_REQUEST_BYTES = 64_000;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      aiBriefingApiPlugin({
        openai: env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
        anthropic: env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY,
        gemini: env.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY,
      }),
      gdacsPublicFeedProxyPlugin(),
      noaaNwsPublicFeedProxyPlugin(),
    ],
  };
});

function aiBriefingApiPlugin(apiKeys: AiBriefingProviderApiKeys): Plugin {
  return {
    name: "global-crisis-observatory-ai-briefing-api",
    configureServer(server) {
      server.middlewares.use(AI_BRIEFING_API_ENDPOINT, (request, response) => {
        void handleAiBriefingApiRequest(request, response, apiKeys);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(AI_BRIEFING_API_ENDPOINT, (request, response) => {
        void handleAiBriefingApiRequest(request, response, apiKeys);
      });
    },
  };
}

function gdacsPublicFeedProxyPlugin(): Plugin {
  return {
    name: "global-crisis-observatory-gdacs-public-feed-proxy",
    configureServer(server) {
      server.middlewares.use(GDACS_RSS_PROXY_ENDPOINT, (request, response) => {
        void handleGdacsPublicFeedProxyRequest(request, response);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(GDACS_RSS_PROXY_ENDPOINT, (request, response) => {
        void handleGdacsPublicFeedProxyRequest(request, response);
      });
    },
  };
}

function noaaNwsPublicFeedProxyPlugin(): Plugin {
  return {
    name: "global-crisis-observatory-noaa-nws-public-feed-proxy",
    configureServer(server) {
      server.middlewares.use(NOAA_NWS_ALERTS_PROXY_ENDPOINT, (request, response) => {
        void handleNoaaNwsPublicFeedProxyRequest(request, response);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(NOAA_NWS_ALERTS_PROXY_ENDPOINT, (request, response) => {
        void handleNoaaNwsPublicFeedProxyRequest(request, response);
      });
    },
  };
}

async function handleGdacsPublicFeedProxyRequest(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
): Promise<void> {
  if (request.method === "OPTIONS") {
    writeText(response, 204, "");
    return;
  }

  if (request.method !== "GET") {
    writeText(response, 405, "GDACS Public Feed proxy requests must use GET.");
    return;
  }

  try {
    const upstreamResponse = await fetch(GDACS_RSS_FEED_ENDPOINT, {
      headers: {
        ...GDACS_RSS_REQUEST_HEADERS,
        "User-Agent": "Global Crisis Observatory Public Feed proxy (no-secret localhost demo)",
      },
    });
    const rssText = await upstreamResponse.text();
    writeText(response, upstreamResponse.status, rssText, upstreamResponse.statusText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    writeText(response, 502, `GDACS Public Feed proxy could not reach ${GDACS_RSS_FEED_ENDPOINT}: ${message}.`);
  }
}

async function handleNoaaNwsPublicFeedProxyRequest(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
): Promise<void> {
  if (request.method === "OPTIONS") {
    writeJson(response, 204, null);
    return;
  }

  if (request.method !== "GET") {
    writeJson(response, 405, { error: "NOAA/NWS Active Alerts Public Feed proxy requests must use GET." });
    return;
  }

  try {
    const upstreamResponse = await fetch(NOAA_NWS_ACTIVE_ALERTS_ENDPOINT, {
      headers: {
        ...NOAA_NWS_ALERTS_REQUEST_HEADERS,
        "User-Agent": "Global Crisis Observatory Public Feed proxy (no-secret localhost demo)",
      },
    });
    const payload = await upstreamResponse.json();
    writeJson(response, upstreamResponse.status, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    writeJson(response, 502, {
      error: `NOAA/NWS Active Alerts Public Feed proxy could not reach ${NOAA_NWS_ACTIVE_ALERTS_ENDPOINT}: ${message}.`,
    });
  }
}

async function handleAiBriefingApiRequest(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  apiKeys: AiBriefingProviderApiKeys,
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
    const aiBriefingProvider = readAiBriefingProvider(body);
    const briefing = await generateProviderAiBriefing({ payload, aiBriefingProvider, apiKeys });
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

function readAiBriefingProvider(value: unknown): AiBriefingChoice {
  if (!isRecord(value) || !isAiBriefingChoice(value.aiBriefingProvider)) {
    throw new Error("The AI Briefing request body is missing a valid AI Briefing Choice.");
  }

  return value.aiBriefingProvider;
}

function writeJson(response: ServerResponse<IncomingMessage>, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(payload === null ? "" : JSON.stringify(payload));
}

function writeText(
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  payload: string,
  statusMessage?: string,
): void {
  response.statusCode = statusCode;
  if (statusMessage !== undefined && statusMessage.trim() !== "") {
    response.statusMessage = statusMessage;
  }
  response.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
  response.end(payload);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
