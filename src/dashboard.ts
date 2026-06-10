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
    mapMarkers: filteredIncidentSet.flatMap(toDashboardMapMarker),
    sourceStatuses: collection.sourceStatuses,
    metrics: buildDashboardMetrics(collection, filteredIncidentSet),
    filterOptions: buildDashboardFilterOptions(collection.incidents),
    hasIncidents: collection.incidents.length > 0,
    hasFilteredIncidentSet: filteredIncidentSet.length > 0,
    hasDegradedSourceStatus,
  };
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
      sourceName: incident.sourceName,
      latitude: incident.coordinates.latitude,
      longitude: incident.coordinates.longitude,
      severityScore: incident.severityScore,
      severityLabel: incident.severityLabel,
      leftPercent: clamp(((incident.coordinates.longitude + 180) / 360) * 100, 3, 97),
      topPercent: clamp(((90 - incident.coordinates.latitude) / 180) * 100, 4, 96),
    },
  ];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
