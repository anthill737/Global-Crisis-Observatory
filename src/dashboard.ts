import {
  filterIncidents,
  type CombinedIncidentCollection,
  type Incident,
  type IncidentCategory,
  type IncidentFilters,
  type PublicFeedId,
  type SeverityLabel,
  type SourceStatus,
  type SourceStatusState,
} from "./lib/incidents";

export interface DashboardMetric {
  label: string;
  value: string;
  detail: string;
  tone: "steady" | "attention" | "critical";
}

export interface DashboardMapMarker {
  id: string;
  title: string;
  category: IncidentCategory;
  source: PublicFeedId;
  sourceName: string;
  latitude: number;
  longitude: number;
  severityScore: number | null;
  severityLabel: SeverityLabel | null;
  leftPercent: number;
  topPercent: number;
}

export interface DashboardFilterOptions {
  categories: IncidentCategory[];
  sources: Array<{ id: PublicFeedId; name: string }>;
  severityLabels: SeverityLabel[];
}

export interface IncidentDetailMetricField {
  label: string;
  value: string;
  sourceName: string;
}

export interface IncidentDetailDisplay {
  title: string;
  categoryLabel: string;
  severityText: string;
  locationText: string;
  startedText: string;
  updatedText: string;
  sourceLinkText: string;
  sourceRecordText: string;
  metricFields: IncidentDetailMetricField[];
  metricFallbackText: string | null;
}

export interface GlobalCrisisDashboardViewModel {
  title: "Global Crisis Observatory";
  refreshedAt: string;
  incidents: Incident[];
  filteredIncidentSet: Incident[];
  mapMarkers: DashboardMapMarker[];
  sourceStatuses: SourceStatus[];
  metrics: DashboardMetric[];
  filterOptions: DashboardFilterOptions;
  hasIncidents: boolean;
  hasFilteredIncidentSet: boolean;
  hasDegradedSourceStatus: boolean;
}

const CATEGORY_ORDER: IncidentCategory[] = [
  "earthquake",
  "wildfire",
  "severe_storm",
  "volcano",
  "flood",
  "sea_lake_ice",
  "drought",
  "dust_haze",
  "other",
];

const SEVERITY_LABEL_ORDER: SeverityLabel[] = ["minor", "moderate", "strong", "major"];
const SOURCE_STATUS_ATTENTION_STATES = new Set<SourceStatusState>(["degraded", "unavailable"]);
const MARKER_COLLISION_MIN_LEFT_PERCENT = 3.5;
const MARKER_COLLISION_MIN_TOP_PERCENT = 5.5;
const MARKER_LEFT_MIN_PERCENT = 3;
const MARKER_LEFT_MAX_PERCENT = 97;
const MARKER_TOP_MIN_PERCENT = 4;
const MARKER_TOP_MAX_PERCENT = 96;

export function buildGlobalCrisisDashboardViewModel(
  collection: CombinedIncidentCollection,
  filters: IncidentFilters = {},
): GlobalCrisisDashboardViewModel {
  const filteredIncidentSet = filterIncidents(collection.incidents, filters);
  const hasDegradedSourceStatus = collection.sourceStatuses.some((sourceStatus) =>
    SOURCE_STATUS_ATTENTION_STATES.has(sourceStatus.state),
  );

  return {
    title: "Global Crisis Observatory",
    refreshedAt: collection.refreshedAt,
    incidents: collection.incidents,
    filteredIncidentSet,
    mapMarkers: spreadOverlappingDashboardMapMarkers(filteredIncidentSet.flatMap(toDashboardMapMarker)),
    sourceStatuses: collection.sourceStatuses,
    metrics: buildDashboardMetrics(collection, filteredIncidentSet),
    filterOptions: buildDashboardFilterOptions(collection.incidents),
    hasIncidents: collection.incidents.length > 0,
    hasFilteredIncidentSet: filteredIncidentSet.length > 0,
    hasDegradedSourceStatus,
  };
}

export function resolveSelectedIncidentId(
  filteredIncidentSet: Incident[],
  selectedIncidentId: string | null,
): string | null {
  if (selectedIncidentId !== null && filteredIncidentSet.some((incident) => incident.id === selectedIncidentId)) {
    return selectedIncidentId;
  }

  return null;
}

export function findSelectedDashboardMapMarker(
  markers: DashboardMapMarker[],
  selectedIncidentId: string | null,
): DashboardMapMarker | null {
  if (selectedIncidentId === null) {
    return null;
  }

  return markers.find((marker) => marker.id === selectedIncidentId) ?? null;
}

export function formatDashboardTimestamp(timestamp: string | null): string {
  if (timestamp === null) {
    return "Not yet available";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

export function formatCategoryLabel(category: IncidentCategory): string {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatSourceStatusState(state: SourceStatusState): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

export function buildIncidentDetailMetricFields(incident: Incident): IncidentDetailMetricField[] {
  const metricFields: IncidentDetailMetricField[] = [];
  const earthquakeMagnitude = readUsgsEarthquakeMagnitude(incident);

  if (earthquakeMagnitude !== null) {
    metricFields.push({
      label: "Earthquake magnitude",
      value: formatMetricNumber(earthquakeMagnitude),
      sourceName: incident.sourceName,
    });
  }

  return metricFields;
}

export function buildIncidentDetailDisplay(incident: Incident): IncidentDetailDisplay {
  const metricFields = buildIncidentDetailMetricFields(incident);

  return {
    title: incident.title,
    categoryLabel: formatCategoryLabel(incident.category),
    severityText: formatIncidentSeverityText(incident),
    locationText: formatIncidentLocation(incident),
    startedText: formatDashboardTimestamp(incident.startedAt),
    updatedText: formatDashboardTimestamp(incident.updatedAt),
    sourceLinkText:
      incident.sourceUrl === null ? `Source link unavailable from ${incident.sourceName}.` : "Open source attribution",
    sourceRecordText: formatIncidentSourceRecordText(incident),
    metricFields,
    metricFallbackText:
      metricFields.length === 0
        ? `No event-specific metrics were published by ${incident.sourceName} for this Incident.`
        : null,
  };
}

export function formatIncidentSeverityText(incident: Incident): string {
  const severity = incident.severityLabel ?? "unscored";
  return `${severity}${incident.severityScore === null ? "" : ` · ${incident.severityScore}`}`;
}

function formatIncidentLocation(incident: Incident): string {
  if (incident.coordinates === null) {
    return "Location unavailable";
  }

  return `${incident.coordinates.latitude.toFixed(4)}, ${incident.coordinates.longitude.toFixed(4)}`;
}

function formatIncidentSourceRecordText(incident: Incident): string {
  const sourceRecordId =
    incident.rawSource.originalId === null ? "source record ID unavailable" : `source record ${incident.rawSource.originalId}`;
  return `${incident.rawSource.publicFeedName} ${sourceRecordId} · Retrieved ${formatDashboardTimestamp(incident.rawSource.retrievedAt)}`;
}

function buildDashboardMetrics(
  collection: CombinedIncidentCollection,
  filteredIncidentSet: Incident[],
): DashboardMetric[] {
  const sourceStatusSummary = collection.sourceStatusSummary;
  const unavailableOrDegradedCount = sourceStatusSummary.degradedCount + sourceStatusSummary.unavailableCount;

  return [
    {
      label: "Filtered Incident Set",
      value: String(filteredIncidentSet.length),
      detail: `${collection.incidents.length} total Incidents from reachable Public Feeds`,
      tone: filteredIncidentSet.length > 0 ? "steady" : "attention",
    },
    {
      label: "Public Feeds Online",
      value: `${sourceStatusSummary.successCount}/${sourceStatusSummary.sourceCount}`,
      detail: unavailableOrDegradedCount === 0 ? "All Source Status checks are successful" : "Some Source Status checks need attention",
      tone: unavailableOrDegradedCount === 0 ? "steady" : "attention",
    },
    {
      label: "Source Status Attention",
      value: String(unavailableOrDegradedCount),
      detail: `${sourceStatusSummary.degradedCount} degraded, ${sourceStatusSummary.unavailableCount} unavailable`,
      tone: sourceStatusSummary.unavailableCount > 0 ? "critical" : unavailableOrDegradedCount > 0 ? "attention" : "steady",
    },
    {
      label: "Last Refresh",
      value: formatDashboardTimestamp(collection.refreshedAt),
      detail: `Latest successful refresh: ${formatDashboardTimestamp(sourceStatusSummary.lastSuccessfulAt)}`,
      tone: sourceStatusSummary.lastSuccessfulAt === null ? "attention" : "steady",
    },
  ];
}

function buildDashboardFilterOptions(incidents: Incident[]): DashboardFilterOptions {
  const categories = new Set<IncidentCategory>();
  const sources = new Map<PublicFeedId, string>();
  const severityLabels = new Set<SeverityLabel>();

  for (const incident of incidents) {
    categories.add(incident.category);
    sources.set(incident.source, incident.sourceName);
    if (incident.severityLabel !== null) {
      severityLabels.add(incident.severityLabel);
    }
  }

  return {
    categories: CATEGORY_ORDER.filter((category) => categories.has(category)),
    sources: [...sources.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    severityLabels: SEVERITY_LABEL_ORDER.filter((severityLabel) => severityLabels.has(severityLabel)),
  };
}

function toDashboardMapMarker(incident: Incident): DashboardMapMarker[] {
  if (incident.coordinates === null) {
    return [];
  }

  return [
    {
      id: incident.id,
      title: incident.title,
      category: incident.category,
      source: incident.source,
      sourceName: incident.sourceName,
      latitude: incident.coordinates.latitude,
      longitude: incident.coordinates.longitude,
      severityScore: incident.severityScore,
      severityLabel: incident.severityLabel,
      leftPercent: clamp(
        ((incident.coordinates.longitude + 180) / 360) * 100,
        MARKER_LEFT_MIN_PERCENT,
        MARKER_LEFT_MAX_PERCENT,
      ),
      topPercent: clamp(
        ((90 - incident.coordinates.latitude) / 180) * 100,
        MARKER_TOP_MIN_PERCENT,
        MARKER_TOP_MAX_PERCENT,
      ),
    },
  ];
}

function spreadOverlappingDashboardMapMarkers(markers: DashboardMapMarker[]): DashboardMapMarker[] {
  const placedMarkers: DashboardMapMarker[] = [];

  for (const marker of markers) {
    placedMarkers.push(placeDashboardMapMarker(marker, placedMarkers));
  }

  return placedMarkers;
}

function placeDashboardMapMarker(marker: DashboardMapMarker, placedMarkers: DashboardMapMarker[]): DashboardMapMarker {
  let leastOverlappedCandidate: DashboardMapMarker | null = null;
  let leastOverlapCount = Number.POSITIVE_INFINITY;

  for (const candidate of buildMarkerPlacementCandidates(marker)) {
    const overlapCount = placedMarkers.filter((placedMarker) => doDashboardMapMarkersOverlap(candidate, placedMarker)).length;

    if (overlapCount === 0) {
      return candidate;
    }

    if (overlapCount < leastOverlapCount) {
      leastOverlappedCandidate = candidate;
      leastOverlapCount = overlapCount;
    }
  }

  return leastOverlappedCandidate ?? marker;
}

function buildMarkerPlacementCandidates(marker: DashboardMapMarker): DashboardMapMarker[] {
  const candidates: DashboardMapMarker[] = [marker];

  for (
    let topPercent = MARKER_TOP_MIN_PERCENT;
    topPercent <= MARKER_TOP_MAX_PERCENT;
    topPercent += MARKER_COLLISION_MIN_TOP_PERCENT
  ) {
    for (
      let leftPercent = MARKER_LEFT_MIN_PERCENT;
      leftPercent <= MARKER_LEFT_MAX_PERCENT;
      leftPercent += MARKER_COLLISION_MIN_LEFT_PERCENT
    ) {
      candidates.push({
        ...marker,
        leftPercent: Number(leftPercent.toFixed(6)),
        topPercent: Number(topPercent.toFixed(6)),
      });
    }
  }

  return candidates.sort(
    (left, right) => calculateMarkerPlacementDistance(left, marker) - calculateMarkerPlacementDistance(right, marker),
  );
}

function calculateMarkerPlacementDistance(left: DashboardMapMarker, right: DashboardMapMarker): number {
  return (left.leftPercent - right.leftPercent) ** 2 + (left.topPercent - right.topPercent) ** 2;
}

function doDashboardMapMarkersOverlap(left: DashboardMapMarker, right: DashboardMapMarker): boolean {
  return (
    Math.abs(left.leftPercent - right.leftPercent) < MARKER_COLLISION_MIN_LEFT_PERCENT &&
    Math.abs(left.topPercent - right.topPercent) < MARKER_COLLISION_MIN_TOP_PERCENT
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function readUsgsEarthquakeMagnitude(incident: Incident): number | null {
  if (incident.source !== "usgs-earthquakes" || !isRecord(incident.rawSource.payload)) {
    return null;
  }

  const properties = incident.rawSource.payload.properties;
  if (!isRecord(properties)) {
    return null;
  }

  const magnitude = properties.mag;
  return typeof magnitude === "number" && Number.isFinite(magnitude) ? magnitude : null;
}

function formatMetricNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
