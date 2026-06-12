import {
  type AiBriefing,
  AiBriefingConfigurationError,
  type AiBriefingError,
  type AiBriefingFetch,
  type AiBriefingOutput,
  type AiBriefingRequestPayload,
  AiBriefingRequestError,
  normalizeAiBriefing,
  toAiBriefingOutput,
  validateAiBriefingRequestPayload,
} from "./ai-briefing";
import { formatAiBriefingProviderLabel, type AiBriefingChoice, type AiBriefingProvider } from "./ai-briefing-choice";

export const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
export const ANTHROPIC_MESSAGES_ENDPOINT = "https://api.anthropic.com/v1/messages";
export const GEMINI_GENERATE_CONTENT_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_OPENAI_AI_BRIEFING_MODEL = "gpt-4.1-mini";
export const DEFAULT_ANTHROPIC_AI_BRIEFING_MODEL = "claude-3-5-haiku-latest";
export const DEFAULT_GEMINI_AI_BRIEFING_MODEL = "gemini-1.5-flash";
export const DEFAULT_AI_BRIEFING_MODEL = DEFAULT_OPENAI_AI_BRIEFING_MODEL;
const AI_BRIEFING_PROVIDER_INSTRUCTIONS =
  "You create concise AI Briefings from public natural-disaster and environmental Incident data. Use only fields present in the payload. Use plain-language labels from categoryLabel, sourceName, severityScoreLabel, sourceReportedMeasurements, and sourceRecord. Clearly separate Severity Score as the app's normalized ranking from source-reported measurements. Do not invent disaster magnitude scales, alert levels, or measurements. If Public Social Context is present, treat it only as aggregated localized public signals. Return JSON only.";

export interface AiBriefingProviderApiKeys {
  openai?: string | null | undefined;
  anthropic?: string | null | undefined;
  gemini?: string | null | undefined;
}

export interface RequestProviderAiBriefingOptions {
  payload: AiBriefingRequestPayload;
  aiBriefingProvider: AiBriefingChoice;
  apiKeys: AiBriefingProviderApiKeys;
  fetcher?: AiBriefingFetch | null;
  models?: Partial<Record<Exclude<AiBriefingProvider, "disabled">, string>>;
}

export interface RequestOpenAiBriefingOptions {
  payload: AiBriefingRequestPayload;
  apiKey: string | null | undefined;
  fetcher?: AiBriefingFetch | null | undefined;
  model?: string | undefined;
}

interface RequestSingleProviderAiBriefingOptions {
  payload: AiBriefingRequestPayload;
  apiKey: string | null | undefined;
  fetcher?: AiBriefingFetch | null | undefined;
  model?: string | undefined;
}

export async function generateProviderAiBriefing(options: RequestProviderAiBriefingOptions): Promise<AiBriefingOutput> {
  switch (options.aiBriefingProvider) {
    case "openai":
      return generateOpenAiBriefing({
        payload: options.payload,
        apiKey: options.apiKeys.openai,
        fetcher: options.fetcher,
        model: options.models?.openai,
      });
    case "anthropic":
      return generateAnthropicAiBriefing({
        payload: options.payload,
        apiKey: options.apiKeys.anthropic,
        fetcher: options.fetcher,
        model: options.models?.anthropic,
      });
    case "gemini":
      return generateGeminiAiBriefing({
        payload: options.payload,
        apiKey: options.apiKeys.gemini,
        fetcher: options.fetcher,
        model: options.models?.gemini,
      });
    case "disabled":
      throw new AiBriefingConfigurationError(
        "AI Briefing Choice is Disabled, so no AI Briefing request was sent. The Global Crisis Dashboard remains interactive.",
      );
  }
}

export async function generateOpenAiBriefing(options: RequestOpenAiBriefingOptions): Promise<AiBriefingOutput> {
  return toAiBriefingOutput(await requestOpenAiBriefing(options));
}

export async function requestOpenAiBriefing(options: RequestOpenAiBriefingOptions): Promise<AiBriefing> {
  const apiKey = requireProviderApiKey("openai", options.apiKey);
  validateAiBriefingRequestPayload(options.payload);
  const fetcher = readAiBriefingFetch(options.fetcher);

  const response = await fetcher(OPENAI_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildOpenAiRequestBody(options.payload, options.model ?? DEFAULT_OPENAI_AI_BRIEFING_MODEL)),
  });

  if (!response.ok) {
    throw await buildProviderHttpError("openai", response);
  }

  return parseProviderJsonBriefing("OpenAI", readOpenAiOutputText(await response.json()));
}

export async function generateAnthropicAiBriefing(options: RequestSingleProviderAiBriefingOptions): Promise<AiBriefingOutput> {
  const apiKey = requireProviderApiKey("anthropic", options.apiKey);
  validateAiBriefingRequestPayload(options.payload);
  const fetcher = readAiBriefingFetch(options.fetcher);

  const response = await fetcher(ANTHROPIC_MESSAGES_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildAnthropicRequestBody(options.payload, options.model ?? DEFAULT_ANTHROPIC_AI_BRIEFING_MODEL)),
  });

  if (!response.ok) {
    throw await buildProviderHttpError("anthropic", response);
  }

  return toAiBriefingOutput(parseProviderJsonBriefing("Anthropic", readAnthropicOutputText(await response.json())));
}

export async function generateGeminiAiBriefing(options: RequestSingleProviderAiBriefingOptions): Promise<AiBriefingOutput> {
  const apiKey = requireProviderApiKey("gemini", options.apiKey);
  validateAiBriefingRequestPayload(options.payload);
  const fetcher = readAiBriefingFetch(options.fetcher);
  const model = encodeURIComponent(options.model ?? DEFAULT_GEMINI_AI_BRIEFING_MODEL);

  const response = await fetcher(`${GEMINI_GENERATE_CONTENT_ENDPOINT_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildGeminiRequestBody(options.payload)),
  });

  if (!response.ok) {
    throw await buildProviderHttpError("gemini", response);
  }

  return toAiBriefingOutput(parseProviderJsonBriefing("Gemini", readGeminiOutputText(await response.json())));
}

function buildOpenAiRequestBody(payload: AiBriefingRequestPayload, model: string): Record<string, unknown> {
  return {
    model,
    input: [
      {
        role: "system",
        content: AI_BRIEFING_PROVIDER_INSTRUCTIONS,
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
        schema: buildAiBriefingJsonSchema(),
      },
    },
  };
}

function buildAnthropicRequestBody(payload: AiBriefingRequestPayload, model: string): Record<string, unknown> {
  return {
    model,
    max_tokens: 900,
    system: AI_BRIEFING_PROVIDER_INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: JSON.stringify({ instructions: "Return one JSON object matching the requested AI Briefing sections.", payload }),
      },
    ],
  };
}

function buildGeminiRequestBody(payload: AiBriefingRequestPayload): Record<string, unknown> {
  return {
    generationConfig: {
      responseMimeType: "application/json",
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: AI_BRIEFING_PROVIDER_INSTRUCTIONS + " Payload: " + JSON.stringify(payload),
          },
        ],
      },
    ],
  };
}

function buildAiBriefingJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      situationSummary: { type: "string" },
      likelyImpactConsiderations: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
      responsePriorityRecommendations: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
      uncertaintyNotes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
    },
    required: ["situationSummary", "likelyImpactConsiderations", "responsePriorityRecommendations", "uncertaintyNotes"],
  };
}

function parseProviderJsonBriefing(providerLabel: string, outputText: string | null): AiBriefing {
  if (outputText === null) {
    throw new AiBriefingRequestError(`${providerLabel} returned an AI Briefing response without readable text.`);
  }

  try {
    return normalizeAiBriefing(JSON.parse(stripJsonCodeFence(outputText)));
  } catch (error) {
    if (error instanceof AiBriefingRequestError) {
      throw error;
    }
    throw new AiBriefingRequestError(`${providerLabel} returned an AI Briefing response that could not be parsed.`);
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

function readAnthropicOutputText(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.content)) {
    return null;
  }

  const textParts = value.content.flatMap((contentItem) =>
    isRecord(contentItem) && typeof contentItem.text === "string" ? [contentItem.text] : [],
  );
  const joinedText = textParts.join("\n").trim();
  return joinedText === "" ? null : joinedText;
}

function readGeminiOutputText(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.candidates)) {
    return null;
  }

  for (const candidate of value.candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
      continue;
    }

    const textParts = candidate.content.parts.flatMap((part) => (isRecord(part) && typeof part.text === "string" ? [part.text] : []));
    const joinedText = textParts.join("\n").trim();
    if (joinedText !== "") {
      return joinedText;
    }
  }

  return null;
}

function requireProviderApiKey(aiBriefingProvider: Exclude<AiBriefingProvider, "disabled">, value: string | null | undefined): string {
  const apiKey = normalizeApiKey(value);
  if (apiKey === null) {
    const envVarName = getProviderApiKeyEnvVarName(aiBriefingProvider);
    throw new AiBriefingConfigurationError(
      `${envVarName} is not configured. Add a valid ${formatAiBriefingProviderLabel(aiBriefingProvider)} key before running an AI Briefing with this AI Briefing Choice. The Global Crisis Dashboard remains interactive.`,
    );
  }

  return apiKey;
}

async function buildProviderHttpError(
  aiBriefingProvider: Exclude<AiBriefingProvider, "disabled">,
  response: { status?: number; statusText?: string; json: () => Promise<unknown> },
): Promise<AiBriefingError> {
  const providerLabel = formatAiBriefingProviderLabel(aiBriefingProvider);
  const envVarName = getProviderApiKeyEnvVarName(aiBriefingProvider);
  const detail = readProviderErrorDetail(await readResponseJson(response));

  if (response.status === 401 || response.status === 403) {
    return new AiBriefingConfigurationError(
      `${envVarName} was rejected by ${providerLabel}. Check that the selected AI Briefing Provider key is valid and has access to the configured model. The Global Crisis Dashboard remains interactive.`,
    );
  }

  if (response.status === 429) {
    return new AiBriefingRequestError(
      `${providerLabel} quota or rate limit was reached for the selected AI Briefing Provider. Try again later or choose another AI Briefing Provider. The Global Crisis Dashboard remains interactive.`,
    );
  }

  return new AiBriefingRequestError(
    `${providerLabel} returned a provider error (${describeHttpStatus(response)}${detail === null ? "" : ": " + detail}). The Global Crisis Dashboard remains interactive.`,
  );
}

function readAiBriefingFetch(fetcher: AiBriefingFetch | null | undefined): AiBriefingFetch {
  const resolvedFetcher = fetcher ?? readGlobalFetch();
  if (resolvedFetcher === null) {
    throw new AiBriefingConfigurationError("AI Briefing requests are unavailable because fetch is not available. The Global Crisis Dashboard remains interactive.");
  }

  return resolvedFetcher;
}

async function readResponseJson(response: { json: () => Promise<unknown> }): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readProviderErrorDetail(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const directMessage = readNonEmptyString(value.error) ?? readNonEmptyString(value.message);
  if (directMessage !== null) {
    return directMessage;
  }

  if (isRecord(value.error)) {
    return readNonEmptyString(value.error.message) ?? readNonEmptyString(value.error.type);
  }

  return null;
}

function getProviderApiKeyEnvVarName(aiBriefingProvider: Exclude<AiBriefingProvider, "disabled">): string {
  switch (aiBriefingProvider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "gemini":
      return "GEMINI_API_KEY";
  }
}

function normalizeApiKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function stripJsonCodeFence(value: string): string {
  const trimmed = value.trim();
  const fencedMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fencedMatch?.[1]?.trim() ?? trimmed;
}

function readGlobalFetch(): AiBriefingFetch | null {
  return typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;
}

function describeHttpStatus(response: { status?: number; statusText?: string }): string {
  const status = typeof response.status === "number" ? String(response.status) : "HTTP error";
  const statusText = typeof response.statusText === "string" && response.statusText.trim() !== "" ? response.statusText.trim() : null;
  return statusText === null ? status : status + " " + statusText;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
