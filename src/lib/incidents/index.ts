export type IncidentCategory =
  | "earthquake"
  | "wildfire"
  | "severe_storm"
  | "volcano"
  | "flood"
  | "sea_lake_ice"
  | "drought"
  | "dust_haze"
  | "other";

export type PublicFeedId = "usgs-earthquakes" | "nasa-eonet";

export type SourceStatusState = "success" | "degraded" | "unavailable";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface RawSourceAttribution<RawPayload = unknown> {
  publicFeed: PublicFeedId;
  publicFeedName: string;
  originalId: string | null;
  retrievedAt: string | null;
  payload: RawPayload;
}

export interface Incident<RawPayload = unknown> {
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
  rawSource: RawSourceAttribution<RawPayload>;
}

export type SeverityLabel = "minor" | "moderate" | "strong" | "major";

export interface IncidentSeverity {
  severityScore: number;
  severityLabel: SeverityLabel;
}

export interface SourceStatus {
  publicFeed: PublicFeedId;
  publicFeedName: string;
  state: SourceStatusState;
  lastAttemptedAt: string;
  lastSuccessfulAt: string | null;
  message: string | null;
}

export interface FeedAdapterResult<RawPayload = unknown> {
  incidents: Incident<RawPayload>[];
  sourceStatus: SourceStatus;
}

export interface SourceStatusSummary {
  sourceCount: number;
  successCount: number;
  degradedCount: number;
  unavailableCount: number;
  lastAttemptedAt: string | null;
  lastSuccessfulAt: string | null;
}

export interface CombinedIncidentCollection {
  incidents: Incident[];
  sourceStatuses: SourceStatus[];
  sourceStatusSummary: SourceStatusSummary;
  refreshedAt: string;
}

export interface CombinedIncidentCollectionOptions {
  usgsEarthquakes?: UsgsEarthquakeFeedAdapterOptions;
  nasaEonet?: NasaEonetFeedAdapterOptions;
  now?: () => Date;
}

export interface IncidentFilters {
  categories?: readonly IncidentCategory[];
  sources?: readonly PublicFeedId[];
  severityLabels?: readonly SeverityLabel[];
  minSeverityScore?: number | null;
  maxSeverityScore?: number | null;
  text?: string | null;
}

export type FilteredIncidentSet = Incident[];

export interface NormalizeIncidentInput<RawPayload = unknown> {
  rawId: string;
  title: string;
  category: IncidentCategory;
  source: PublicFeedId;
  sourceName: string;
  sourceUrl?: string | null;
  coordinates?: Coordinates | null;
  startedAt: string | number | Date;
  updatedAt?: string | number | Date | null;
  severityScore?: number | null;
  severityLabel?: string | null;
  retrievedAt?: string | number | Date | null;
  rawPayload: RawPayload;
}

export interface UsgsEarthquakeFeature {
  id?: unknown;
  properties?: {
    title?: unknown;
    url?: unknown;
    time?: unknown;
    updated?: unknown;
    mag?: unknown;
  } | null;
  geometry?: {
    type?: unknown;
    coordinates?: unknown;
  } | null;
}

export interface UsgsEarthquakeFeedPayload {
  type?: unknown;
  metadata?: {
    generated?: unknown;
    url?: unknown;
    title?: unknown;
  } | null;
  features?: UsgsEarthquakeFeature[] | null;
}

export interface NasaEonetIncidentPayload {
  id?: unknown;
  title?: unknown;
  link?: unknown;
  closed?: unknown;
  categories?: Array<{ id?: unknown; title?: unknown }> | null;
  sources?: Array<{ id?: unknown; url?: unknown }> | null;
  geometry?: NasaEonetGeometry[] | null;
}

export interface NasaEonetGeometry {
  date?: unknown;
  type?: unknown;
  coordinates?: unknown;
}

export interface NasaEonetFeedPayload {
  title?: unknown;
  description?: unknown;
  link?: unknown;
  events?: NasaEonetIncidentPayload[] | null;
}

export interface NasaEonetFeedAdapterOptions {
  endpoint?: string | URL;
  fetcher?: FeedAdapterFetch;
  limit?: number;
  now?: () => Date;
}

export interface UsgsEarthquakeFeedAdapterOptions {
  endpoint?: string | URL;
  fetcher?: FeedAdapterFetch;
  now?: () => Date;
}

export interface FeedAdapterFetchResponse {
  ok: boolean;
  status?: number;
  statusText?: string;
  json: () => Promise<unknown>;
}

export type FeedAdapterFetch = (
  input: string | URL,
  init?: { headers?: Record<string, string> },
) => Promise<FeedAdapterFetchResponse>;

const PUBLIC_FEED_NAMES: Record<PublicFeedId, string> = {
  "usgs-earthquakes": "USGS Earthquakes",
  "nasa-eonet": "NASA EONET",
};

export const NASA_EONET_EVENTS_ENDPOINT = "https://eonet.gsfc.nasa.gov/api/v3/events";
export const NASA_EONET_DEFAULT_LIMIT = 50;
export const USGS_EARTHQUAKE_FEED_ENDPOINT =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

export function createIncidentId(source: PublicFeedId, rawId: string): string {
  return `${source}:${rawId.trim()}`;
}

export function normalizeIncident<RawPayload>(
  input: NormalizeIncidentInput<RawPayload>,
): Incident<RawPayload> | null {
  const title = input.title.trim();
  const rawId = input.rawId.trim();
  const startedAt = toIsoTimestamp(input.startedAt);

  if (!rawId || !title || startedAt === null) {
    return null;
  }

  const severity = scoreIncidentSeverity({
    category: input.category,
    severityScore: input.severityScore ?? null,
    severityLabel: input.severityLabel ?? null,
  });

  return {
    id: createIncidentId(input.source, rawId),
    title,
    category: input.category,
    source: input.source,
    sourceName: input.sourceName,
    sourceUrl: normalizeNullableUrl(input.sourceUrl),
    coordinates: normalizeCoordinates(input.coordinates),
    startedAt,
    updatedAt: toIsoTimestamp(input.updatedAt ?? null),
    severityScore: severity.severityScore,
    severityLabel: severity.severityLabel,
    rawSource: {
      publicFeed: input.source,
      publicFeedName: input.sourceName,
      originalId: rawId,
      retrievedAt: toIsoTimestamp(input.retrievedAt ?? null),
      payload: input.rawPayload,
    },
  };
}

export function normalizeUsgsEarthquakeIncident(
  feature: UsgsEarthquakeFeature,
  options: { retrievedAt?: string | number | Date | null } = {},
): Incident<UsgsEarthquakeFeature> | null {
  const rawId = readString(feature.id);
  const title = readString(feature.properties?.title);
  const magnitude = readNumber(feature.properties?.mag);
  const coordinates = readUsgsCoordinates(feature.geometry?.coordinates);
  const startedAt = readTimestamp(feature.properties?.time);

  if (rawId === null || title === null || startedAt === null) {
    return null;
  }

  return normalizeIncident({
    rawId,
    title,
    category: "earthquake",
    source: "usgs-earthquakes",
    sourceName: PUBLIC_FEED_NAMES["usgs-earthquakes"],
    sourceUrl: readString(feature.properties?.url),
    coordinates,
    startedAt,
    updatedAt: readTimestamp(feature.properties?.updated),
    severityScore: scoreEarthquakeMagnitude(magnitude),
    severityLabel: labelEarthquakeMagnitude(magnitude),
    retrievedAt: options.retrievedAt ?? null,
    rawPayload: feature,
  });
}

export function normalizeNasaEonetIncident(
  payload: NasaEonetIncidentPayload,
  options: { retrievedAt?: string | number | Date | null } = {},
): Incident<NasaEonetIncidentPayload> | null {
  const rawId = readString(payload.id);
  const title = readString(payload.title);
  const geometryTimeline = readNasaEonetGeometryTimeline(payload.geometry);

  if (rawId === null || title === null || geometryTimeline === null) {
    return null;
  }

  return normalizeIncident({
    rawId,
    title,
    category: mapNasaEonetCategory(payload.categories?.[0]?.id),
    source: "nasa-eonet",
    sourceName: PUBLIC_FEED_NAMES["nasa-eonet"],
    sourceUrl: readFirstUrl(payload.sources) ?? normalizeNullableUrl(readString(payload.link)),
    coordinates: readNasaEonetCoordinates(geometryTimeline.currentGeometry.coordinates),
    startedAt: geometryTimeline.startedAt,
    updatedAt: readLatestTimestamp([geometryTimeline.updatedAt, readTimestamp(payload.closed)], geometryTimeline.startedAt),
    severityScore: null,
    severityLabel: null,
    retrievedAt: options.retrievedAt ?? null,
    rawPayload: payload,
  });
}

export async function fetchUsgsEarthquakeFeed(
  options: UsgsEarthquakeFeedAdapterOptions = {},
): Promise<FeedAdapterResult<UsgsEarthquakeFeature>> {
  const now = options.now ?? (() => new Date());
  const attemptedAt = now().toISOString();
  const endpoint = options.endpoint ?? USGS_EARTHQUAKE_FEED_ENDPOINT;
  const fetcher = options.fetcher ?? readGlobalFetch();

  if (fetcher === null) {
    return createUsgsEarthquakeAdapterResult(
      [],
      "unavailable",
      attemptedAt,
      null,
      "USGS Earthquakes fetch is unavailable in this runtime.",
    );
  }

  try {
    const response = await fetcher(endpoint, {
      headers: { Accept: "application/geo+json, application/json" },
    });

    if (!response.ok) {
      return createUsgsEarthquakeAdapterResult(
        [],
        "unavailable",
        attemptedAt,
        null,
        `USGS Earthquakes returned ${describeHttpStatus(response)}.`,
      );
    }

    const payload = await response.json();
    const features = readUsgsEarthquakeFeatures(payload);

    if (features === null) {
      return createUsgsEarthquakeAdapterResult(
        [],
        "degraded",
        attemptedAt,
        null,
        "USGS Earthquakes returned a payload without a features list.",
      );
    }

    const incidents = features.flatMap((feature) => {
      const incident = normalizeUsgsEarthquakeIncident(feature, { retrievedAt: attemptedAt });
      return incident === null ? [] : [incident];
    });

    const skippedCount = features.length - incidents.length;
    const message =
      skippedCount > 0 ? `Skipped ${skippedCount} USGS Earthquakes features missing required Incident fields.` : null;

    return createUsgsEarthquakeAdapterResult(
      incidents,
      skippedCount > 0 ? "degraded" : "success",
      attemptedAt,
      attemptedAt,
      message,
    );
  } catch (error) {
    return createUsgsEarthquakeAdapterResult(
      [],
      "unavailable",
      attemptedAt,
      null,
      `USGS Earthquakes fetch failed: ${error instanceof Error ? error.message : "unknown error"}.`,
    );
  }
}

export async function fetchNasaEonetIncidents(
  options: NasaEonetFeedAdapterOptions = {},
): Promise<FeedAdapterResult<NasaEonetIncidentPayload>> {
  const now = options.now ?? (() => new Date());
  const attemptedAt = now().toISOString();
  const endpoint =
    options.endpoint ??
    (options.limit === undefined ? buildNasaEonetEventsEndpoint() : buildNasaEonetEventsEndpoint({ limit: options.limit }));
  const fetcher = options.fetcher ?? readGlobalFetch();

  if (fetcher === null) {
    return createNasaEonetAdapterResult([], "unavailable", attemptedAt, null, "NASA EONET fetch is unavailable in this runtime.");
  }

  try {
    const response = await fetcher(endpoint, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return createNasaEonetAdapterResult(
        [],
        "unavailable",
        attemptedAt,
        null,
        `NASA EONET returned ${describeHttpStatus(response)}.`,
      );
    }

    const payload = await response.json();
    const events = readNasaEonetEvents(payload);

    if (events === null) {
      return createNasaEonetAdapterResult(
        [],
        "degraded",
        attemptedAt,
        null,
        "NASA EONET returned a payload without an events list.",
      );
    }

    const incidents = events.flatMap((event) => {
      const incident = normalizeNasaEonetIncident(event, { retrievedAt: attemptedAt });
      return incident === null ? [] : [incident];
    });

    const skippedCount = events.length - incidents.length;
    const message = skippedCount > 0 ? `Skipped ${skippedCount} NASA EONET payloads missing required Incident fields.` : null;

    return createNasaEonetAdapterResult(incidents, skippedCount > 0 ? "degraded" : "success", attemptedAt, attemptedAt, message);
  } catch (error) {
    return createNasaEonetAdapterResult(
      [],
      "unavailable",
      attemptedAt,
      null,
      `NASA EONET fetch failed: ${error instanceof Error ? error.message : "unknown error"}.`,
    );
  }
}

export async function fetchCombinedIncidentCollection(
  options: CombinedIncidentCollectionOptions = {},
): Promise<CombinedIncidentCollection> {
  const now = options.now ?? (() => new Date());
  const refreshedAt = now().toISOString();
  const defaultAdapterNow = () => new Date(refreshedAt);
  const usgsOptions: UsgsEarthquakeFeedAdapterOptions = { ...(options.usgsEarthquakes ?? {}) };
  const nasaOptions: NasaEonetFeedAdapterOptions = { ...(options.nasaEonet ?? {}) };

  if (usgsOptions.now === undefined) {
    usgsOptions.now = defaultAdapterNow;
  }

  if (nasaOptions.now === undefined) {
    nasaOptions.now = defaultAdapterNow;
  }

  const [usgsResult, nasaResult] = await Promise.all([
    fetchUsgsEarthquakeFeed(usgsOptions).then(toCombinedFeedAdapterResult, (error) =>
      createUnavailableCombinedFeedAdapterResult(
        "usgs-earthquakes",
        refreshedAt,
        `USGS Earthquakes adapter failed before returning Source Status: ${describeError(error)}.`,
      ),
    ),
    fetchNasaEonetIncidents(nasaOptions).then(toCombinedFeedAdapterResult, (error) =>
      createUnavailableCombinedFeedAdapterResult(
        "nasa-eonet",
        refreshedAt,
        `NASA EONET adapter failed before returning Source Status: ${describeError(error)}.`,
      ),
    ),
  ]);

  const sourceStatuses = [usgsResult.sourceStatus, nasaResult.sourceStatus];
  const incidents = [...usgsResult.incidents, ...nasaResult.incidents].sort(compareIncidentsByFreshness);

  return {
    incidents,
    sourceStatuses,
    sourceStatusSummary: summarizeSourceStatus(sourceStatuses),
    refreshedAt,
  };
}

export function buildNasaEonetEventsEndpoint(options: { limit?: number } = {}): string {
  const url = new URL(NASA_EONET_EVENTS_ENDPOINT);
  url.searchParams.set("status", "open");
  url.searchParams.set("limit", String(normalizePositiveInteger(options.limit, NASA_EONET_DEFAULT_LIMIT)));
  return url.toString();
}

export function scoreIncidentSeverity(input: {
  category: IncidentCategory;
  severityScore?: number | null;
  severityLabel?: string | null;
}): IncidentSeverity {
  const severityLabel = normalizeSeverityLabel(input.severityLabel ?? null);
  const explicitScore = normalizeSeverityScore(input.severityScore ?? null);
  if (explicitScore !== null) {
    return {
      severityScore: explicitScore,
      severityLabel: labelSeverityScore(explicitScore),
    };
  }

  const severityScore = severityLabel === null ? scoreIncidentCategory(input.category) : scoreSeverityLabel(severityLabel);

  return {
    severityScore,
    severityLabel: severityLabel ?? labelSeverityScore(severityScore),
  };
}

export function filterIncidents(incidents: readonly Incident[], filters: IncidentFilters = {}): FilteredIncidentSet {
  const categorySet = createFilterSet(filters.categories);
  const sourceSet = createFilterSet(filters.sources);
  const severityLabelSet = createFilterSet(filters.severityLabels);
  const minSeverityScore = normalizeSeverityBoundary(filters.minSeverityScore ?? null);
  const maxSeverityScore = normalizeSeverityBoundary(filters.maxSeverityScore ?? null);
  const textTokens = normalizeFilterText(filters.text ?? null);

  return incidents.filter((incident) => {
    if (categorySet !== null && !categorySet.has(incident.category)) {
      return false;
    }

    if (sourceSet !== null && !sourceSet.has(incident.source)) {
      return false;
    }

    if (severityLabelSet !== null && (incident.severityLabel === null || !severityLabelSet.has(incident.severityLabel))) {
      return false;
    }

    if (minSeverityScore !== null && (incident.severityScore === null || incident.severityScore < minSeverityScore)) {
      return false;
    }

    if (maxSeverityScore !== null && (incident.severityScore === null || incident.severityScore > maxSeverityScore)) {
      return false;
    }

    if (textTokens.length > 0 && !matchesIncidentText(incident, textTokens)) {
      return false;
    }

    return true;
  });
}

function toCombinedFeedAdapterResult(result: FeedAdapterResult): FeedAdapterResult {
  return {
    incidents: [...result.incidents],
    sourceStatus: result.sourceStatus,
  };
}

function createUnavailableCombinedFeedAdapterResult(
  publicFeed: PublicFeedId,
  attemptedAt: string,
  message: string,
): FeedAdapterResult {
  return {
    incidents: [],
    sourceStatus: {
      publicFeed,
      publicFeedName: PUBLIC_FEED_NAMES[publicFeed],
      state: "unavailable",
      lastAttemptedAt: attemptedAt,
      lastSuccessfulAt: null,
      message,
    },
  };
}

function summarizeSourceStatus(sourceStatuses: SourceStatus[]): SourceStatusSummary {
  return {
    sourceCount: sourceStatuses.length,
    successCount: sourceStatuses.filter((sourceStatus) => sourceStatus.state === "success").length,
    degradedCount: sourceStatuses.filter((sourceStatus) => sourceStatus.state === "degraded").length,
    unavailableCount: sourceStatuses.filter((sourceStatus) => sourceStatus.state === "unavailable").length,
    lastAttemptedAt: readLatestIsoTimestamp(sourceStatuses.map((sourceStatus) => sourceStatus.lastAttemptedAt)),
    lastSuccessfulAt: readLatestIsoTimestamp(
      sourceStatuses.flatMap((sourceStatus) =>
        sourceStatus.lastSuccessfulAt === null ? [] : [sourceStatus.lastSuccessfulAt],
      ),
    ),
  };
}

function compareIncidentsByFreshness(left: Incident, right: Incident): number {
  const rightTimestamp = Date.parse(right.updatedAt ?? right.startedAt);
  const leftTimestamp = Date.parse(left.updatedAt ?? left.startedAt);
  return rightTimestamp - leftTimestamp || left.id.localeCompare(right.id);
}

function readLatestIsoTimestamp(timestamps: string[]): string | null {
  const latest = timestamps.reduce<number | null>((latestTimestamp, timestamp) => {
    const parsedTimestamp = Date.parse(timestamp);

    if (!Number.isFinite(parsedTimestamp)) {
      return latestTimestamp;
    }

    return latestTimestamp === null || parsedTimestamp > latestTimestamp ? parsedTimestamp : latestTimestamp;
  }, null);

  return latest === null ? null : new Date(latest).toISOString();
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function createUsgsEarthquakeAdapterResult(
  incidents: Incident<UsgsEarthquakeFeature>[],
  state: SourceStatusState,
  lastAttemptedAt: string,
  lastSuccessfulAt: string | null,
  message: string | null,
): FeedAdapterResult<UsgsEarthquakeFeature> {
  return {
    incidents,
    sourceStatus: {
      publicFeed: "usgs-earthquakes",
      publicFeedName: PUBLIC_FEED_NAMES["usgs-earthquakes"],
      state,
      lastAttemptedAt,
      lastSuccessfulAt,
      message,
    },
  };
}

function createNasaEonetAdapterResult(
  incidents: Incident<NasaEonetIncidentPayload>[],
  state: SourceStatusState,
  lastAttemptedAt: string,
  lastSuccessfulAt: string | null,
  message: string | null,
): FeedAdapterResult<NasaEonetIncidentPayload> {
  return {
    incidents,
    sourceStatus: {
      publicFeed: "nasa-eonet",
      publicFeedName: PUBLIC_FEED_NAMES["nasa-eonet"],
      state,
      lastAttemptedAt,
      lastSuccessfulAt,
      message,
    },
  };
}

function readUsgsEarthquakeFeatures(payload: unknown): UsgsEarthquakeFeature[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.features)) {
    return null;
  }

  return payload.features.filter(isRecord);
}

function readNasaEonetEvents(payload: unknown): NasaEonetIncidentPayload[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.events)) {
    return null;
  }

  return payload.events.filter(isRecord);
}

function readGlobalFetch(): FeedAdapterFetch | null {
  return typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;
}

function describeHttpStatus(response: FeedAdapterFetchResponse): string {
  const status = typeof response.status === "number" ? String(response.status) : "an unsuccessful status";
  const statusText = readString(response.statusText);
  return statusText === null ? status : `${status} ${statusText}`;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function toIsoTimestamp(value: string | number | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeCoordinates(value: Coordinates | null | undefined): Coordinates | null {
  if (value === null || value === undefined) {
    return null;
  }

  const { latitude, longitude } = value;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

function normalizeSeverityScore(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

function normalizeSeverityLabel(value: string | null): SeverityLabel | null {
  switch (normalizeNullableText(value)?.toLowerCase()) {
    case "minor":
      return "minor";
    case "moderate":
      return "moderate";
    case "strong":
      return "strong";
    case "major":
      return "major";
    default:
      return null;
  }
}

function scoreSeverityLabel(severityLabel: SeverityLabel): number {
  switch (severityLabel) {
    case "major":
      return 85;
    case "strong":
      return 60;
    case "moderate":
      return 40;
    case "minor":
      return 15;
  }
}

function labelSeverityScore(severityScore: number): SeverityLabel {
  if (severityScore >= 70) {
    return "major";
  }
  if (severityScore >= 50) {
    return "strong";
  }
  if (severityScore >= 30) {
    return "moderate";
  }

  return "minor";
}

function scoreIncidentCategory(category: IncidentCategory): number {
  switch (category) {
    case "wildfire":
      return 65;
    case "severe_storm":
    case "volcano":
    case "flood":
      return 60;
    case "drought":
      return 45;
    case "sea_lake_ice":
    case "dust_haze":
      return 35;
    case "earthquake":
      return 40;
    case "other":
      return 20;
  }
}

function scoreEarthquakeMagnitude(magnitude: number | null): number | null {
  return magnitude === null ? null : normalizeSeverityScore(magnitude * 10);
}

function labelEarthquakeMagnitude(magnitude: number | null): SeverityLabel | null {
  return magnitude === null ? null : labelSeverityScore(magnitude * 10);
}

function normalizeSeverityBoundary(value: number | null): number | null {
  return normalizeSeverityScore(value);
}

function createFilterSet<T extends string>(values: readonly T[] | undefined): Set<T> | null {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  return new Set(values);
}

function normalizeFilterText(value: string | null): string[] {
  return normalizeNullableText(value)?.toLowerCase().split(/\s+/u) ?? [];
}

function matchesIncidentText(incident: Incident, textTokens: string[]): boolean {
  const searchableText = [
    incident.id,
    incident.title,
    incident.category,
    incident.source,
    incident.sourceName,
    incident.sourceUrl,
    incident.severityLabel,
    incident.rawSource.originalId,
    incident.rawSource.publicFeedName,
  ]
    .flatMap((value) => (value === null ? [] : [value]))
    .join(" ")
    .toLowerCase();

  return textTokens.every((token) => searchableText.includes(token));
}

function normalizeNullableText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeNullableUrl(value: string | null | undefined): string | null {
  const text = normalizeNullableText(value ?? null);
  if (text === null) {
    return null;
  }

  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readTimestamp(value: unknown): string | number | Date | null {
  if (typeof value === "string" || typeof value === "number" || value instanceof Date) {
    return value;
  }

  return null;
}

function readUsgsCoordinates(value: unknown): Coordinates | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const longitude = readNumber(value[0]);
  const latitude = readNumber(value[1]);
  if (latitude === null || longitude === null) {
    return null;
  }

  return normalizeCoordinates({ latitude, longitude });
}

interface NasaEonetGeometryTimeline {
  startedAt: string;
  updatedAt: string | null;
  currentGeometry: NasaEonetGeometry;
}

function readNasaEonetGeometryTimeline(geometries: NasaEonetIncidentPayload["geometry"]): NasaEonetGeometryTimeline | null {
  if (!Array.isArray(geometries)) {
    return null;
  }

  const datedGeometries = geometries.flatMap((geometry) => {
    const timestamp = toIsoTimestamp(readTimestamp(geometry.date));
    return timestamp === null ? [] : [{ geometry, timestamp, time: new Date(timestamp).getTime() }];
  });

  const firstDatedGeometry = datedGeometries[0];
  if (firstDatedGeometry === undefined) {
    return null;
  }

  let earliestGeometry = firstDatedGeometry;
  let latestGeometry = firstDatedGeometry;

  for (const datedGeometry of datedGeometries) {
    if (datedGeometry.time < earliestGeometry.time) {
      earliestGeometry = datedGeometry;
    }
    if (datedGeometry.time > latestGeometry.time) {
      latestGeometry = datedGeometry;
    }
  }

  return {
    startedAt: earliestGeometry.timestamp,
    updatedAt: latestGeometry.timestamp === earliestGeometry.timestamp ? null : latestGeometry.timestamp,
    currentGeometry: latestGeometry.geometry,
  };
}

function readLatestTimestamp(values: Array<string | number | Date | null>, redundantTimestamp: string): string | null {
  const timestamps = values.flatMap((value) => {
    const timestamp = toIsoTimestamp(value);
    return timestamp === null ? [] : [timestamp];
  });

  if (timestamps.length === 0) {
    return null;
  }

  const latestTimestamp = timestamps.reduce((latest, timestamp) =>
    new Date(timestamp).getTime() > new Date(latest).getTime() ? timestamp : latest,
  );

  return latestTimestamp === redundantTimestamp ? null : latestTimestamp;
}

function readNasaEonetCoordinates(value: unknown): Coordinates | null {
  const position = findFirstPosition(value);
  if (position === null) {
    return null;
  }

  return normalizeCoordinates({ latitude: position[1], longitude: position[0] });
}

function findFirstPosition(value: unknown): [number, number] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    return [value[0], value[1]];
  }

  for (const item of value) {
    const position = findFirstPosition(item);
    if (position !== null) {
      return position;
    }
  }

  return null;
}

function mapNasaEonetCategory(value: unknown): IncidentCategory {
  switch (readString(value)) {
    case "wildfires":
      return "wildfire";
    case "severeStorms":
      return "severe_storm";
    case "volcanoes":
      return "volcano";
    case "floods":
      return "flood";
    case "seaLakeIce":
      return "sea_lake_ice";
    case "drought":
      return "drought";
    case "dustHaze":
      return "dust_haze";
    default:
      return "other";
  }
}

function readFirstUrl(sources: NasaEonetIncidentPayload["sources"]): string | null {
  if (!Array.isArray(sources)) {
    return null;
  }

  for (const source of sources) {
    const url = normalizeNullableUrl(readString(source.url));
    if (url !== null) {
      return url;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
