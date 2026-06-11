import type { Coordinates, Incident, IncidentCategory, IncidentFilters, PublicFeedId, SeverityLabel } from "./incidents";

export const AI_BRIEFING_API_ENDPOINT = "/api/ai-briefing";
const MAX_FILTERED_INCIDENT_SET_ITEMS = 12;

export type AiBriefingScope = "single-incident" | "filtered-incident-set";

export interface PublicAiBriefingIncident {
  id: string;
  title: string;
  category: IncidentCategory;
  source: PublicFeedId;
  sourceName: string;
  sourceUrl: string | null;
  coordinates: Coordinates | null;
  startedAt: string;
  updatedAt: string | null;
  severityScore: number | null;
  severityLabel: SeverityLabel | null;
  sourceRecord: {
    publicFeed: PublicFeedId;
    publicFeedName: string;
    originalId: string | null;
    retrievedAt: string | null;
  };
}

export interface AiBriefingRequestPayload {
  requestedOutput: {
    situationSummary: true;
    likelyImpactConsiderations: true;
    responsePriorityRecommendations: true;
    uncertaintyNotes: true;
  };
  publicDataNotice: string;
  scope:
    | {
        kind: "selected_incident";
        label: "selected Incident";
        incident: PublicAiBriefingIncident;
      }
    | {
        kind: "filtered_incident_set";
        label: "Filtered Incident Set";
        incidentCount: number;
        filters: PublicIncidentFilters;
        incidents: PublicAiBriefingIncident[];
      };
}

export interface PublicIncidentFilters {
  categories?: readonly IncidentCategory[];
  sources?: readonly PublicFeedId[];
  severityLabels?: readonly SeverityLabel[];
  minSeverityScore?: number | null;
  maxSeverityScore?: number | null;
}

export interface AiBriefing {
  situationSummary: string;
  likelyImpactConsiderations: string[];
  responsePriorityRecommendations: string[];
  uncertaintyNotes: string[];
}

export interface AiBriefingOutput {
  situationSummary: string;
  impactConsiderations: string;
  responsePriorityRecommendation: string;
  uncertaintyNotes: string[];
}

export type AiBriefingFetch = (
  input: string | URL,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status?: number;
  statusText?: string;
  json: () => Promise<unknown>;
}>;

export interface RequestAiBriefingOptions {
  fetcher?: AiBriefingFetch | null;
}

export class AiBriefingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiBriefingError";
  }
}

export class AiBriefingConfigurationError extends AiBriefingError {
  constructor(message: string) {
    super(message);
    this.name = "AiBriefingConfigurationError";
  }
}

export class AiBriefingRequestError extends AiBriefingError {
  constructor(message: string) {
    super(message);
    this.name = "AiBriefingRequestError";
  }
}

export function buildSingleIncidentBriefingRequest(incident: Incident | null): AiBriefingRequestPayload {
  if (incident === null) {
    throw new AiBriefingRequestError("Select an Incident before requesting an AI Briefing for one Incident.");
  }

  return buildAiBriefingRequestPayload({ selectedIncident: incident, filteredIncidentSet: [] });
}

export function buildFilteredIncidentSetBriefingRequest(
  filteredIncidentSet: readonly Incident[],
  filters: IncidentFilters = {},
): AiBriefingRequestPayload {
  return buildAiBriefingRequestPayload({ selectedIncident: null, filteredIncidentSet, filters });
}

export function buildAiBriefingRequestPayload(input: {
  selectedIncident: Incident | null;
  filteredIncidentSet: readonly Incident[];
  filters?: IncidentFilters;
}): AiBriefingRequestPayload {
  const requestedOutput = {
    situationSummary: true,
    likelyImpactConsiderations: true,
    responsePriorityRecommendations: true,
    uncertaintyNotes: true,
  } as const;
  const publicDataNotice = "Use only the public Incident fields in this payload. Do not request PII, confidential context, or private operational data.";

  if (input.selectedIncident !== null) {
    return {
      requestedOutput,
      publicDataNotice,
      scope: {
        kind: "selected_incident",
        label: "selected Incident",
        incident: toPublicAiBriefingIncident(input.selectedIncident),
      },
    };
  }

  return {
    requestedOutput,
    publicDataNotice,
    scope: {
      kind: "filtered_incident_set",
      label: "Filtered Incident Set",
      incidentCount: input.filteredIncidentSet.length,
      filters: toPublicIncidentFilters(input.filters ?? {}),
      incidents: input.filteredIncidentSet.slice(0, MAX_FILTERED_INCIDENT_SET_ITEMS).map(toPublicAiBriefingIncident),
    },
  };
}

export function validateAiBriefingRequestPayload(payload: AiBriefingRequestPayload): void {
  const incidents = payload.scope.kind === "selected_incident" ? [payload.scope.incident] : payload.scope.incidents;

  if (incidents.length === 0) {
    throw new AiBriefingRequestError("The AI Briefing needs at least one public Incident to summarize.");
  }

  for (const incident of incidents) {
    if (incident.id.trim() === "" || incident.title.trim() === "" || incident.startedAt.trim() === "") {
      throw new AiBriefingRequestError("The AI Briefing payload contains an Incident missing required public fields.");
    }
  }

  const forbiddenKeys = new Set(["rawsource", "payload", "email", "phone", "pii", "confidentialcontext", "privatecontext", "text"]);
  for (const key of collectObjectKeys(payload)) {
    if (forbiddenKeys.has(key.toLowerCase())) {
      throw new AiBriefingRequestError("The AI Briefing payload contains a non-public field: " + key + ".");
    }
  }
}

export async function generateAiBriefing(
  payload: AiBriefingRequestPayload,
  options: RequestAiBriefingOptions = {},
): Promise<AiBriefingOutput> {
  validateAiBriefingRequestPayload(payload);

  const fetcher = options.fetcher ?? readGlobalFetch();
  if (fetcher === null) {
    throw new AiBriefingConfigurationError("AI Briefing requests are unavailable because fetch is not available. The Global Crisis Dashboard remains interactive.");
  }

  const response = await fetcher(AI_BRIEFING_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload }),
  });
  const responsePayload = await readResponseJson(response);

  if (!response.ok) {
    const message = readApiErrorMessage(responsePayload) ?? "AI Briefing generation failed. The Global Crisis Dashboard remains interactive.";
    if (response.status === 401 || response.status === 403 || readApiErrorCode(responsePayload) === "configuration") {
      throw new AiBriefingConfigurationError(message);
    }

    throw new AiBriefingRequestError(message);
  }

  return normalizeAiBriefingOutput(responsePayload);
}

export function toAiBriefingOutput(briefing: AiBriefing): AiBriefingOutput {
  return {
    situationSummary: briefing.situationSummary,
    impactConsiderations: briefing.likelyImpactConsiderations.join(" "),
    responsePriorityRecommendation: briefing.responsePriorityRecommendations.join(" "),
    uncertaintyNotes: briefing.uncertaintyNotes,
  };
}

export function normalizeAiBriefingOutput(value: unknown): AiBriefingOutput {
  if (!isRecord(value)) {
    throw new AiBriefingRequestError("AI Briefing generation returned an unexpected response.");
  }

  const outputValue = isRecord(value.briefing) ? value.briefing : value;
  const situationSummary = readNonEmptyString(outputValue.situationSummary);
  const impactConsiderations = readNonEmptyString(outputValue.impactConsiderations);
  const responsePriorityRecommendation = readNonEmptyString(outputValue.responsePriorityRecommendation);
  const uncertaintyNotes = readStringList(outputValue.uncertaintyNotes);

  if (
    situationSummary === null ||
    impactConsiderations === null ||
    responsePriorityRecommendation === null ||
    uncertaintyNotes.length === 0
  ) {
    throw new AiBriefingRequestError("AI Briefing generation returned an incomplete response.");
  }

  return {
    situationSummary,
    impactConsiderations,
    responsePriorityRecommendation,
    uncertaintyNotes,
  };
}

export function normalizeAiBriefing(value: unknown): AiBriefing {
  if (!isRecord(value)) {
    throw new AiBriefingRequestError("OpenAI returned an AI Briefing response in an unexpected format.");
  }

  const situationSummary = readNonEmptyString(value.situationSummary);
  const likelyImpactConsiderations = readStringList(value.likelyImpactConsiderations ?? value.impactConsiderations);
  const responsePriorityRecommendations = readStringList(
    value.responsePriorityRecommendations ?? value.responsePriorityRecommendation,
  );
  const uncertaintyNotes = readStringList(value.uncertaintyNotes);

  if (
    situationSummary === null ||
    likelyImpactConsiderations.length === 0 ||
    responsePriorityRecommendations.length === 0 ||
    uncertaintyNotes.length === 0
  ) {
    throw new AiBriefingRequestError("OpenAI returned an incomplete AI Briefing.");
  }

  return {
    situationSummary,
    likelyImpactConsiderations,
    responsePriorityRecommendations,
    uncertaintyNotes,
  };
}

export function formatAiBriefingRequestError(error: unknown): string {
  return error instanceof Error ? error.message : "The AI Briefing request failed for an unknown reason.";
}

function toPublicAiBriefingIncident(incident: Incident): PublicAiBriefingIncident {
  return {
    id: incident.id,
    title: incident.title,
    category: incident.category,
    source: incident.source,
    sourceName: incident.sourceName,
    sourceUrl: incident.sourceUrl,
    coordinates: incident.coordinates,
    startedAt: incident.startedAt,
    updatedAt: incident.updatedAt,
    severityScore: incident.severityScore,
    severityLabel: incident.severityLabel,
    sourceRecord: {
      publicFeed: incident.rawSource.publicFeed,
      publicFeedName: incident.rawSource.publicFeedName,
      originalId: incident.rawSource.originalId,
      retrievedAt: incident.rawSource.retrievedAt,
    },
  };
}

function toPublicIncidentFilters(filters: IncidentFilters): PublicIncidentFilters {
  const sanitizedFilters: PublicIncidentFilters = {};

  if (filters.categories !== undefined && filters.categories.length > 0) {
    sanitizedFilters.categories = [...filters.categories];
  }
  if (filters.sources !== undefined && filters.sources.length > 0) {
    sanitizedFilters.sources = [...filters.sources];
  }
  if (filters.severityLabels !== undefined && filters.severityLabels.length > 0) {
    sanitizedFilters.severityLabels = [...filters.severityLabels];
  }
  if (typeof filters.minSeverityScore === "number" && Number.isFinite(filters.minSeverityScore)) {
    sanitizedFilters.minSeverityScore = filters.minSeverityScore;
  }
  if (typeof filters.maxSeverityScore === "number" && Number.isFinite(filters.maxSeverityScore)) {
    sanitizedFilters.maxSeverityScore = filters.maxSeverityScore;
  }

  return sanitizedFilters;
}

async function readResponseJson(response: { json: () => Promise<unknown> }): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readApiErrorMessage(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  return readNonEmptyString(value.error) ?? readNonEmptyString(value.message);
}

function readApiErrorCode(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  return readNonEmptyString(value.code);
}

function readGlobalFetch(): AiBriefingFetch | null {
  return typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStringList(value: unknown): string[] {
  if (typeof value === "string") {
    const text = value.trim();
    return text === "" ? [] : [text];
  }

  return Array.isArray(value) ? value.flatMap((item) => (readNonEmptyString(item) === null ? [] : [String(item).trim()])) : [];
}

function collectObjectKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectObjectKeys);
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => [key, ...collectObjectKeys(nestedValue)]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
