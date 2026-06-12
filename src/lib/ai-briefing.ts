import type { AiBriefingChoice } from "./ai-briefing-choice";
import type { Coordinates, Incident, IncidentCategory, IncidentFilters, PublicFeedId, SeverityLabel } from "./incidents";
import {
  buildSourceReportedMeasurementFields,
  formatIncidentCategoryLabel,
  formatIncidentSeverityScoreText,
  type SourceReportedMeasurementField,
} from "./incident-labels";

export const AI_BRIEFING_API_ENDPOINT = "/api/ai-briefing";
const MAX_FILTERED_INCIDENT_SET_ITEMS = 12;
const MAX_PUBLIC_SOCIAL_CONTEXT_SIGNALS = 4;

export type AiBriefingScope = "single-incident" | "filtered-incident-set";

export interface PublicAiBriefingIncident {
  id: string;
  title: string;
  category: IncidentCategory;
  categoryLabel: string;
  source: PublicFeedId;
  sourceName: string;
  sourceUrl: string | null;
  coordinates: Coordinates | null;
  startedAt: string;
  updatedAt: string | null;
  severityScore: number | null;
  severityLabel: SeverityLabel | null;
  severityScoreLabel: string;
  sourceReportedMeasurements: SourceReportedMeasurementField[];
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
  publicSocialContext?: PublicSocialContext;
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

export type PublicSocialContextSourceType = "public_official" | "public_web" | "public_social";

export interface PublicSocialContextInput {
  locality?: unknown;
  signals?: readonly PublicSocialContextSignalInput[] | null;
}

export interface PublicSocialContextSignalInput {
  topic?: unknown;
  localizedSummary?: unknown;
  sourceType?: unknown;
  observedAt?: unknown;
  sourceUrl?: unknown;
}

export interface PublicSocialContext {
  safetyNotice: "Localized public signal summaries aggregated from public sources.";
  locality: string;
  signals: PublicSocialContextSignal[];
}

export interface PublicSocialContextSignal {
  topic: string;
  localizedSummary: string;
  sourceType: PublicSocialContextSourceType;
  observedAt: string | null;
  sourceUrl: string | null;
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
  aiBriefingChoice?: AiBriefingChoice;
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

export interface BuildAiBriefingRequestOptions {
  aiBriefingChoice?: AiBriefingChoice | null;
  publicSocialContext?: PublicSocialContextInput | null;
}

export function buildSingleIncidentBriefingRequest(
  incident: Incident | null,
  options: BuildAiBriefingRequestOptions = {},
): AiBriefingRequestPayload {
  if (incident === null) {
    throw new AiBriefingRequestError("Select an Incident before requesting an AI Briefing for one Incident.");
  }

  return buildAiBriefingRequestPayload({ selectedIncident: incident, filteredIncidentSet: [], ...options });
}

export function buildFilteredIncidentSetBriefingRequest(
  filteredIncidentSet: readonly Incident[],
  filters: IncidentFilters = {},
  options: BuildAiBriefingRequestOptions = {},
): AiBriefingRequestPayload {
  return buildAiBriefingRequestPayload({ selectedIncident: null, filteredIncidentSet, filters, ...options });
}

export function buildSelectedIncidentPublicSocialContext(
  incident: Incident | null,
  aiBriefingChoice: AiBriefingChoice | null | undefined,
): PublicSocialContext | null {
  if (incident === null || !supportsPublicSocialContext(aiBriefingChoice)) {
    return null;
  }

  const locality = readIncidentPublicContextLocality(incident);
  const categoryLabel = formatIncidentCategoryForPublicContext(incident.category);
  const sourceName = readSafePublicSocialContextText(incident.sourceName, 80) ?? "selected Public Feed";

  if (locality === null) {
    return null;
  }

  return toProviderSafePublicSocialContext(
    {
      locality,
      signals: [
        {
          topic: categoryLabel + " public context scope",
          localizedSummary: `Broad public signals are relevant only when they match the selected ${categoryLabel} Incident near ${locality} and its source-attributed facts.`,
          sourceType: "public_social",
          observedAt: incident.startedAt,
          sourceUrl: incident.sourceUrl,
        },
        {
          topic: "Source separation",
          localizedSummary: `${sourceName} remains the core Public Feed source; treat broader public context as separate, contextual, and uncertain.`,
          sourceType: "public_official",
          observedAt: incident.rawSource.retrievedAt ?? incident.updatedAt ?? incident.startedAt,
          sourceUrl: incident.sourceUrl,
        },
      ],
    },
    aiBriefingChoice,
  );
}

export function buildAiBriefingRequestPayload(input: {
  selectedIncident: Incident | null;
  filteredIncidentSet: readonly Incident[];
  filters?: IncidentFilters;
  aiBriefingChoice?: AiBriefingChoice | null;
  publicSocialContext?: PublicSocialContextInput | null;
}): AiBriefingRequestPayload {
  const requestedOutput = {
    situationSummary: true,
    likelyImpactConsiderations: true,
    responsePriorityRecommendations: true,
    uncertaintyNotes: true,
  } as const;
  const publicDataNotice =
    "Use only the public Incident fields in this payload. Use categoryLabel, sourceName, startedAt/updatedAt, severityScoreLabel, sourceReportedMeasurements, and sourceRecord for readable wording. Treat Severity Score only as the app's normalized ranking, not as an official source measurement. Do not invent disaster magnitude scales, measurements, PII, confidential context, or private operational data.";
  const publicSocialContext = toProviderSafePublicSocialContext(input.publicSocialContext ?? null, input.aiBriefingChoice);

  if (input.selectedIncident !== null) {
    return {
      requestedOutput,
      publicDataNotice,
      ...(publicSocialContext === null ? {} : { publicSocialContext }),
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
    ...(publicSocialContext === null ? {} : { publicSocialContext }),
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

    if (incident.sourceUrl !== null && readNullablePublicUrl(incident.sourceUrl) === null) {
      throw new AiBriefingRequestError("The AI Briefing payload contains an unsafe public sourceUrl.");
    }
  }

  if (payload.publicSocialContext !== undefined) {
    validatePublicSocialContext(payload.publicSocialContext);
  }

  const forbiddenKeyFragments = [
    "rawsource",
    "payload",
    "email",
    "phone",
    "pii",
    "confidential",
    "private",
    "username",
    "userhandle",
    "directquote",
    "privatemessage",
    "privatepost",
    "contactdetail",
  ];
  for (const key of collectObjectKeys(payload)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "text" || forbiddenKeyFragments.some((forbiddenKeyFragment) => normalizedKey.includes(forbiddenKeyFragment))) {
      throw new AiBriefingRequestError("The AI Briefing payload contains a non-public field: " + key + ".");
    }
  }
}

export function supportsPublicSocialContext(aiBriefingChoice: AiBriefingChoice | null | undefined): boolean {
  return aiBriefingChoice === undefined || aiBriefingChoice === "openai" || aiBriefingChoice === "anthropic" || aiBriefingChoice === "gemini";
}

export async function generateAiBriefing(
  payload: AiBriefingRequestPayload,
  options: RequestAiBriefingOptions = {},
): Promise<AiBriefingOutput> {
  validateAiBriefingRequestPayload(payload);

  const aiBriefingChoice = options.aiBriefingChoice ?? "openai";
  if (aiBriefingChoice === "disabled") {
    throw new AiBriefingConfigurationError(
      "AI Briefing Choice is Disabled, so no AI Briefing request was sent. The Global Crisis Dashboard remains interactive.",
    );
  }

  const fetcher = options.fetcher ?? readGlobalFetch();
  if (fetcher === null) {
    throw new AiBriefingConfigurationError("AI Briefing requests are unavailable because fetch is not available. The Global Crisis Dashboard remains interactive.");
  }

  const response = await fetcher(AI_BRIEFING_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ aiBriefingProvider: aiBriefingChoice, payload }),
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
    throw new AiBriefingRequestError("AI Briefing Provider returned an AI Briefing response in an unexpected format.");
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
    throw new AiBriefingRequestError("AI Briefing Provider returned an incomplete AI Briefing.");
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
    categoryLabel: formatIncidentCategoryLabel(incident.category),
    source: incident.source,
    sourceName: incident.sourceName,
    sourceUrl: readNullablePublicUrl(incident.sourceUrl),
    coordinates: incident.coordinates,
    startedAt: incident.startedAt,
    updatedAt: incident.updatedAt,
    severityScore: incident.severityScore,
    severityLabel: incident.severityLabel,
    severityScoreLabel: formatIncidentSeverityScoreText(incident),
    sourceReportedMeasurements: buildSourceReportedMeasurementFields(incident),
    sourceRecord: {
      publicFeed: incident.rawSource.publicFeed,
      publicFeedName: incident.rawSource.publicFeedName,
      originalId: incident.rawSource.originalId,
      retrievedAt: incident.rawSource.retrievedAt,
    },
  };
}

function toProviderSafePublicSocialContext(
  publicSocialContext: PublicSocialContextInput | null,
  aiBriefingChoice: AiBriefingChoice | null | undefined,
): PublicSocialContext | null {
  if (publicSocialContext === null || !supportsPublicSocialContext(aiBriefingChoice)) {
    return null;
  }

  const locality = readSafePublicSocialContextText(publicSocialContext.locality, 80);
  if (locality === null || !Array.isArray(publicSocialContext.signals)) {
    return null;
  }

  const signals = publicSocialContext.signals
    .flatMap(toPublicSocialContextSignal)
    .slice(0, MAX_PUBLIC_SOCIAL_CONTEXT_SIGNALS);

  if (signals.length === 0) {
    return null;
  }

  return {
    safetyNotice: "Localized public signal summaries aggregated from public sources.",
    locality,
    signals,
  };
}

function toPublicSocialContextSignal(signal: PublicSocialContextSignalInput): PublicSocialContextSignal[] {
  const topic = readSafePublicSocialContextText(signal.topic, 80);
  const localizedSummary = readSafePublicSocialContextText(signal.localizedSummary, 240);
  const sourceType = readPublicSocialContextSourceType(signal.sourceType);

  if (topic === null || localizedSummary === null || sourceType === null) {
    return [];
  }

  return [
    {
      topic,
      localizedSummary,
      sourceType,
      observedAt: readIsoTimestamp(signal.observedAt),
      sourceUrl: readNullablePublicUrl(signal.sourceUrl),
    },
  ];
}

function validatePublicSocialContext(publicSocialContext: PublicSocialContext): void {
  if (publicSocialContext.signals.length === 0) {
    throw new AiBriefingRequestError("The Public Social Context payload needs at least one localized public signal.");
  }

  const valuesToCheck = [
    publicSocialContext.locality,
    ...publicSocialContext.signals.flatMap((signal) => [signal.topic, signal.localizedSummary, signal.sourceUrl]),
  ];
  if (valuesToCheck.some((value) => value !== null && hasUnsafePublicSocialContextContent(value))) {
    throw new AiBriefingRequestError("The Public Social Context payload contains non-public or identifying content.");
  }
}

function readPublicSocialContextSourceType(value: unknown): PublicSocialContextSourceType | null {
  switch (value) {
    case "public_official":
    case "public_web":
    case "public_social":
      return value;
    default:
      return null;
  }
}

function readSafePublicSocialContextText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.replace(/\s+/gu, " ").trim();
  if (normalizedValue === "" || normalizedValue.length > maxLength || hasUnsafePublicSocialContextContent(normalizedValue)) {
    return null;
  }

  return normalizedValue;
}

function hasUnsafePublicSocialContextContent(value: string): boolean {
  return (
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(value) ||
    /(^|[\s/])@[a-z0-9_]{2,}\b/iu.test(value) ||
    /\+?\d[\d\s().-]{7,}\d/u.test(value) ||
    /"[^"]+"|'[^']+'|“[^”]+”|‘[^’]+’/u.test(value) ||
    /\b(?:address|confidential|contact details?|direct quote|dm|email|phone|pii|private|rumou?r|unverified|username|user name)\b/iu.test(
      value,
    )
  );
}

function readIncidentPublicContextLocality(incident: Incident): string | null {
  const titleLocality = incident.title.split(" - ").at(-1) ?? incident.title;
  const withoutMagnitude = titleLocality.replace(/^M\s*\d+(?:\.\d+)?\s*-\s*/iu, "");
  return readSafePublicSocialContextText(withoutMagnitude, 80) ?? readSafePublicSocialContextText(incident.title, 80);
}

function formatIncidentCategoryForPublicContext(category: IncidentCategory): string {
  return category
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function readIsoTimestamp(value: unknown): string | null {
  if (!(typeof value === "string" || typeof value === "number" || value instanceof Date)) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readNullablePublicUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    const url = new URL(value);
    const normalizedUrl = url.toString();
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    if (hasUnsafePublicSocialContextContent(normalizedUrl) || hasUnsafePublicSocialContextContent(decodeUriComponentSafe(normalizedUrl))) {
      return null;
    }

    return normalizedUrl;
  } catch {
    return null;
  }
}

function decodeUriComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
