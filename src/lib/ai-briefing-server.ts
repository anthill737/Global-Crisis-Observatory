import {
  type AiBriefing,
  AiBriefingConfigurationError,
  type AiBriefingFetch,
  type AiBriefingOutput,
  type AiBriefingRequestPayload,
  AiBriefingRequestError,
  normalizeAiBriefing,
  toAiBriefingOutput,
  validateAiBriefingRequestPayload,
} from "./ai-briefing";

export const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
export const DEFAULT_AI_BRIEFING_MODEL = "gpt-4.1-mini";

export interface RequestOpenAiBriefingOptions {
  payload: AiBriefingRequestPayload;
  apiKey: string | null | undefined;
  fetcher?: AiBriefingFetch | null;
  model?: string;
}

export async function generateOpenAiBriefing(options: RequestOpenAiBriefingOptions): Promise<AiBriefingOutput> {
  return toAiBriefingOutput(await requestOpenAiBriefing(options));
}

export async function requestOpenAiBriefing(options: RequestOpenAiBriefingOptions): Promise<AiBriefing> {
  const apiKey = normalizeApiKey(options.apiKey);
  if (apiKey === null) {
    throw new AiBriefingConfigurationError(
      "OPENAI_API_KEY is not configured. Add a valid key before running an AI Briefing. The Global Crisis Dashboard remains interactive.",
    );
  }

  validateAiBriefingRequestPayload(options.payload);
  const fetcher = options.fetcher ?? readGlobalFetch();
  if (fetcher === null) {
    throw new AiBriefingConfigurationError("AI Briefing requests are unavailable because fetch is not available. The Global Crisis Dashboard remains interactive.");
  }

  const response = await fetcher(OPENAI_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildOpenAiRequestBody(options.payload, options.model ?? DEFAULT_AI_BRIEFING_MODEL)),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AiBriefingConfigurationError(
        "OPENAI_API_KEY was rejected by OpenAI. Check that the key is valid and has access to the configured model. The Global Crisis Dashboard remains interactive.",
      );
    }

    throw new AiBriefingRequestError("OpenAI could not complete the AI Briefing request (" + describeHttpStatus(response) + ").");
  }

  return parseOpenAiBriefingResponse(await response.json());
}

function buildOpenAiRequestBody(payload: AiBriefingRequestPayload, model: string): Record<string, unknown> {
  return {
    model,
    input: [
      {
        role: "system",
        content: "You create concise AI Briefings from public natural-disaster and environmental Incident data. Return JSON only.",
      },
      {
        role: "user",
        content: JSON.stringify(payload),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "ai_briefing",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            situationSummary: { type: "string" },
            likelyImpactConsiderations: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
            responsePriorityRecommendations: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
            uncertaintyNotes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
          },
          required: ["situationSummary", "likelyImpactConsiderations", "responsePriorityRecommendations", "uncertaintyNotes"],
        },
      },
    },
  };
}

function parseOpenAiBriefingResponse(responsePayload: unknown): AiBriefing {
  const outputText = readOpenAiOutputText(responsePayload);
  if (outputText === null) {
    throw new AiBriefingRequestError("OpenAI returned an AI Briefing response without readable text.");
  }

  try {
    return normalizeAiBriefing(JSON.parse(outputText));
  } catch (error) {
    if (error instanceof AiBriefingRequestError) {
      throw error;
    }
    throw new AiBriefingRequestError("OpenAI returned an AI Briefing response that could not be parsed.");
  }
}

function readOpenAiOutputText(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.output_text === "string") {
    return value.output_text;
  }

  if (Array.isArray(value.output)) {
    for (const outputItem of value.output) {
      if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) {
        continue;
      }

      for (const contentItem of outputItem.content) {
        if (isRecord(contentItem) && typeof contentItem.text === "string") {
          return contentItem.text;
        }
      }
    }
  }

  return null;
}

function normalizeApiKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function readGlobalFetch(): AiBriefingFetch | null {
  return typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;
}

function describeHttpStatus(response: { status?: number; statusText?: string }): string {
  const status = typeof response.status === "number" ? String(response.status) : "HTTP error";
  const statusText = typeof response.statusText === "string" && response.statusText.trim() !== "" ? response.statusText.trim() : null;
  return statusText === null ? status : status + " " + statusText;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
