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
  incidentIds: string[];
  incidentCount: number;
  category: IncidentCategory;
  source: PublicFeedId;
  sourceName: string;
  latitude: number;
  longitude: number;
  severityScore: number | null;
  severityLabel: SeverityLabel | null;
  leftPercent: number;
  topPercent: number;
  depth: number;
  isVisible: boolean;
}

export interface DashboardGlobeView {
  rotationLongitude: number;
  rotationLatitude: number;
  zoom: number;
}

export interface AreaSearchArea {
  id: string;
  label: string;
  center: {
    latitude: number;
    longitude: number;
  };
  radiusKm: number;
  matchedTerms: string[];
}

export interface AreaSearchNearbyIncident {
  incident: Incident;
  distanceKm: number;
}

export type AreaSearchResolution =
  | {
      status: "idle";
      query: "";
      message: string;
    }
  | {
      status: "success";
      query: string;
      area: AreaSearchArea;
      nearbyIncidents: AreaSearchNearbyIncident[];
      message: string;
    }
  | {
      status: "no-result";
      query: string;
      message: string;
    }
  | {
      status: "ambiguous";
      query: string;
      candidates: AreaSearchArea[];
      message: string;
    }
  | {
      status: "failure";
      query: string;
      message: string;
    };

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
const MARKER_COLLISION_MIN_LEFT_PERCENT = 1.3;
const MARKER_COLLISION_MIN_TOP_PERCENT = 1.3;
const MARKER_LEFT_MIN_PERCENT = 8;
const MARKER_LEFT_MAX_PERCENT = 92;
const MARKER_TOP_MIN_PERCENT = 8;
const MARKER_TOP_MAX_PERCENT = 92;
const MARKER_GLOBE_RADIUS_PERCENT = 41;
const MARKER_AGGREGATION_MIN_COUNT = 3;
const MARKER_AGGREGATION_MAX_RADIUS_PERCENT = 3.2;
const MARKER_AGGREGATION_MIN_RADIUS_PERCENT = 1.1;
const MARKER_RESERVED_OVERLAY_AREAS: MarkerReservedOverlayArea[] = [
  { minLeftPercent: 8, maxLeftPercent: 72, minTopPercent: 8, maxTopPercent: 24 },
  { minLeftPercent: 52, maxLeftPercent: 92, minTopPercent: 8, maxTopPercent: 27 },
  { minLeftPercent: 28, maxLeftPercent: 72, minTopPercent: 86, maxTopPercent: 92 },
];
const GLOBE_DEFAULT_VIEW: DashboardGlobeView = {
  rotationLongitude: -105,
  rotationLatitude: 18,
  zoom: 1,
};
const AREA_SEARCH_MAX_QUERY_LENGTH = 120;
const AREA_SEARCH_GAZETTEER: AreaSearchGazetteerEntry[] = [
  {
    id: "anchorage-alaska",
    label: "Anchorage, Alaska",
    aliases: ["anchorage", "anchorage alaska"],
    center: { latitude: 61.2181, longitude: -149.9003 },
    radiusKm: 240,
  },
  {
    id: "alaska-united-states",
    label: "Alaska, United States",
    aliases: ["alaska", "state of alaska", "ak", "alaska region"],
    center: { latitude: 64.2008, longitude: -149.4937 },
    radiusKm: 1250,
  },
  {
    id: "gulf-of-alaska",
    label: "Gulf of Alaska",
    aliases: ["gulf of alaska", "alaska gulf", "alaska region"],
    center: { latitude: 56.5, longitude: -145.2 },
    radiusKm: 780,
  },
  {
    id: "british-columbia-canada",
    label: "British Columbia, Canada",
    aliases: ["british columbia", "bc canada", "b c canada"],
    center: { latitude: 53.7267, longitude: -127.6476 },
    radiusKm: 720,
  },
  {
    id: "pacific-northwest",
    label: "Pacific Northwest",
    aliases: ["pacific northwest", "pnw"],
    center: { latitude: 47.7511, longitude: -120.7401 },
    radiusKm: 900,
  },
  {
    id: "california-united-states",
    label: "California, United States",
    aliases: ["california", "ca", "southern california"],
    center: { latitude: 36.7783, longitude: -119.4179 },
    radiusKm: 760,
  },
  {
    id: "philippines",
    label: "Philippines",
    aliases: ["philippines", "luzon", "manila"],
    center: { latitude: 12.8797, longitude: 121.774 },
    radiusKm: 820,
  },
  {
    id: "japan",
    label: "Japan",
    aliases: ["japan", "honshu", "tokyo"],
    center: { latitude: 36.2048, longitude: 138.2529 },
    radiusKm: 900,
  },
  {
    id: "indonesia",
    label: "Indonesia",
    aliases: ["indonesia", "sumatra", "java"],
    center: { latitude: -2.5489, longitude: 118.0149 },
    radiusKm: 1500,
  },
  {
    id: "caribbean",
    label: "Caribbean",
    aliases: ["caribbean", "caribbean sea"],
    center: { latitude: 15.3266, longitude: -76.1572 },
    radiusKm: 1200,
  },
  {
    id: "east-africa",
    label: "East Africa",
    aliases: ["east africa", "horn of africa"],
    center: { latitude: 1.2921, longitude: 36.8219 },
    radiusKm: 1400,
  },
  {
    id: "europe",
    label: "Europe",
    aliases: ["europe", "western europe", "central europe"],
    center: { latitude: 50.1109, longitude: 8.6821 },
    radiusKm: 1800,
  },
];

interface MarkerReservedOverlayArea {
  minLeftPercent: number;
  maxLeftPercent: number;
  minTopPercent: number;
  maxTopPercent: number;
}

interface AreaSearchGazetteerEntry extends Omit<AreaSearchArea, "matchedTerms"> {
  aliases: string[];
}

export function buildGlobalCrisisDashboardViewModel(
  collection: CombinedIncidentCollection,
  filters: IncidentFilters = {},
  globeView: DashboardGlobeView = GLOBE_DEFAULT_VIEW,
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
    mapMarkers: spreadOverlappingDashboardMapMarkers(
      aggregateDashboardMapMarkers(
        filteredIncidentSet.flatMap((incident) => toDashboardMapMarker(incident, globeView)),
        globeView,
      ),
    ),
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

  return markers.find((marker) => marker.id === selectedIncidentId || marker.incidentIds.includes(selectedIncidentId)) ?? null;
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

export function normalizeDashboardGlobeView(globeView: DashboardGlobeView): DashboardGlobeView {
  return {
    rotationLongitude: normalizeLongitude(globeView.rotationLongitude),
    rotationLatitude: clamp(globeView.rotationLatitude, -68, 68),
    zoom: clamp(globeView.zoom, 0.78, 1.72),
  };
}

export function createIdleAreaSearchResolution(): AreaSearchResolution {
  return {
    status: "idle",
    query: "",
    message: "Enter a place or region to focus the Globe Map and emphasize nearby Incidents.",
  };
}

export function resolveAreaSearchQuery(query: string, incidents: Incident[]): AreaSearchResolution {
  const trimmedQuery = query.trim();
  if (trimmedQuery === "") {
    return createIdleAreaSearchResolution();
  }

  try {
    const candidates = findAreaSearchCandidates(trimmedQuery);
    if (candidates.length === 0) {
      return {
        status: "no-result",
        query: trimmedQuery,
        message: `No Area Search match found for "${trimmedQuery}". Try a broader place or region name.`,
      };
    }

    if (candidates.length > 1) {
      return {
        status: "ambiguous",
        query: trimmedQuery,
        candidates,
        message: `Area Search found ${candidates.length} possible matches for "${trimmedQuery}". Choose one to focus the Globe Map.`,
      };
    }

    const area = candidates[0]!;
    const nearbyIncidents = findNearbyIncidentsForArea(area, incidents);
    const nearbyText =
      nearbyIncidents.length === 0
        ? "No current Incidents are within the Area Search radius."
        : `${nearbyIncidents.length} nearby ${nearbyIncidents.length === 1 ? "Incident" : "Incidents"} emphasized.`;

    return {
      status: "success",
      query: trimmedQuery,
      area,
      nearbyIncidents,
      message: `Globe Map focused on ${area.label}. ${nearbyText}`,
    };
  } catch (error) {
    return {
      status: "failure",
      query: trimmedQuery,
      message:
        error instanceof Error
          ? error.message
          : "Area Search lookup failed. Existing filters, Incident Detail, Saved Events View, and Source Status remain available.",
    };
  }
}

export function focusGlobeViewOnAreaSearchArea(area: AreaSearchArea, currentGlobeView: DashboardGlobeView): DashboardGlobeView {
  return normalizeDashboardGlobeView({
    ...currentGlobeView,
    rotationLatitude: area.center.latitude,
    rotationLongitude: area.center.longitude,
    zoom: area.radiusKm <= 300 ? 1.58 : area.radiusKm <= 850 ? 1.28 : 1.02,
  });
}

function findAreaSearchCandidates(query: string): AreaSearchArea[] {
  if (query.length > AREA_SEARCH_MAX_QUERY_LENGTH) {
    throw new Error(
      "Area Search lookup failed because the query is too long to evaluate locally. Shorten the place or region name and try again.",
    );
  }

  const coordinateArea = parseAreaSearchCoordinates(query);
  if (coordinateArea !== null) {
    return [coordinateArea];
  }

  const normalizedQuery = normalizeAreaSearchTerm(query);
  if (normalizedQuery === "") {
    return [];
  }

  const exactMatches = AREA_SEARCH_GAZETTEER.filter((entry) =>
    [entry.label, ...entry.aliases].some((alias) => normalizeAreaSearchTerm(alias) === normalizedQuery),
  );
  const matches =
    exactMatches.length > 0
      ? exactMatches
      : AREA_SEARCH_GAZETTEER.filter((entry) =>
          [entry.label, ...entry.aliases].some((alias) => normalizeAreaSearchTerm(alias).includes(normalizedQuery)),
        );

  return matches.map(toAreaSearchArea);
}

function parseAreaSearchCoordinates(query: string): AreaSearchArea | null {
  const coordinateMatch = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/u);
  if (coordinateMatch === null) {
    return null;
  }

  const latitude = Number(coordinateMatch[1]);
  const longitude = Number(coordinateMatch[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error(
      "Area Search lookup failed because coordinates must be latitude and longitude values within world bounds.",
    );
  }

  return {
    id: `coordinates-${latitude.toFixed(3)}-${longitude.toFixed(3)}`,
    label: `Coordinates ${latitude.toFixed(3)}, ${longitude.toFixed(3)}`,
    center: { latitude, longitude },
    radiusKm: 300,
    matchedTerms: [query.trim()],
  };
}

function toAreaSearchArea(entry: AreaSearchGazetteerEntry): AreaSearchArea {
  return {
    id: entry.id,
    label: entry.label,
    center: entry.center,
    radiusKm: entry.radiusKm,
    matchedTerms: entry.aliases,
  };
}

function findNearbyIncidentsForArea(area: AreaSearchArea, incidents: Incident[]): AreaSearchNearbyIncident[] {
  return incidents
    .flatMap((incident) => {
      if (incident.coordinates === null) {
        return [];
      }

      const distanceKm = calculateCoordinateDistanceKm(area.center, incident.coordinates);
      return distanceKm <= area.radiusKm ? [{ incident, distanceKm: Number(distanceKm.toFixed(1)) }] : [];
    })
    .sort((left, right) => left.distanceKm - right.distanceKm);
}

function toDashboardMapMarker(incident: Incident, globeView: DashboardGlobeView): DashboardMapMarker[] {
  if (incident.coordinates === null) {
    return [];
  }

  const projection = projectCoordinatesToGlobe(incident.coordinates.latitude, incident.coordinates.longitude, globeView);

  return [
    {
      id: incident.id,
      title: incident.title,
      incidentIds: [incident.id],
      incidentCount: 1,
      category: incident.category,
      source: incident.source,
      sourceName: incident.sourceName,
      latitude: incident.coordinates.latitude,
      longitude: incident.coordinates.longitude,
      severityScore: incident.severityScore,
      severityLabel: incident.severityLabel,
      leftPercent: projection.leftPercent,
      topPercent: projection.topPercent,
      depth: projection.depth,
      isVisible: projection.isVisible,
    },
  ];
}

function aggregateDashboardMapMarkers(
  markers: DashboardMapMarker[],
  globeView: DashboardGlobeView,
): DashboardMapMarker[] {
  const aggregationRadiusPercent = calculateMarkerAggregationRadiusPercent(globeView);
  const usedMarkerIds = new Set<string>();
  const aggregatedMarkers: DashboardMapMarker[] = [];

  for (const marker of markers) {
    if (usedMarkerIds.has(marker.id)) {
      continue;
    }

    if (!marker.isVisible) {
      aggregatedMarkers.push(marker);
      usedMarkerIds.add(marker.id);
      continue;
    }

    const nearbyMarkers = markers.filter(
      (candidate) =>
        candidate.isVisible &&
        !usedMarkerIds.has(candidate.id) &&
        calculateMarkerPlacementDistance(marker, candidate) <= aggregationRadiusPercent ** 2,
    );

    if (nearbyMarkers.length < MARKER_AGGREGATION_MIN_COUNT) {
      aggregatedMarkers.push(marker);
      usedMarkerIds.add(marker.id);
      continue;
    }

    for (const nearbyMarker of nearbyMarkers) {
      usedMarkerIds.add(nearbyMarker.id);
    }
    aggregatedMarkers.push(toAggregateDashboardMapMarker(nearbyMarkers));
  }

  return aggregatedMarkers;
}

function calculateMarkerAggregationRadiusPercent(globeView: DashboardGlobeView): number {
  const normalizedGlobeView = normalizeDashboardGlobeView(globeView);
  return clamp(
    MARKER_AGGREGATION_MAX_RADIUS_PERCENT / normalizedGlobeView.zoom,
    MARKER_AGGREGATION_MIN_RADIUS_PERCENT,
    MARKER_AGGREGATION_MAX_RADIUS_PERCENT,
  );
}

function toAggregateDashboardMapMarker(markers: DashboardMapMarker[]): DashboardMapMarker {
  const primaryMarker = [...markers].sort(compareDashboardMapMarkerPriority)[0] ?? markers[0]!;
  const incidentIds = markers.flatMap((marker) => marker.incidentIds).sort();
  const leftPercent = markers.reduce((sum, marker) => sum + marker.leftPercent, 0) / markers.length;
  const topPercent = markers.reduce((sum, marker) => sum + marker.topPercent, 0) / markers.length;
  const depth = markers.reduce((sum, marker) => sum + marker.depth, 0) / markers.length;
  const latitude = markers.reduce((sum, marker) => sum + marker.latitude, 0) / markers.length;
  const longitude = markers.reduce((sum, marker) => sum + marker.longitude, 0) / markers.length;

  return {
    ...primaryMarker,
    title: `${incidentIds.length} nearby Incidents including ${primaryMarker.title}`,
    incidentIds,
    incidentCount: incidentIds.length,
    leftPercent: Number(leftPercent.toFixed(6)),
    topPercent: Number(topPercent.toFixed(6)),
    depth: Number(depth.toFixed(6)),
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    isVisible: true,
  };
}

function compareDashboardMapMarkerPriority(left: DashboardMapMarker, right: DashboardMapMarker): number {
  const rightSeverityScore = right.severityScore ?? -1;
  const leftSeverityScore = left.severityScore ?? -1;
  if (rightSeverityScore !== leftSeverityScore) {
    return rightSeverityScore - leftSeverityScore;
  }

  const rightSeverityRank = right.severityLabel === null ? -1 : SEVERITY_LABEL_ORDER.indexOf(right.severityLabel);
  const leftSeverityRank = left.severityLabel === null ? -1 : SEVERITY_LABEL_ORDER.indexOf(left.severityLabel);
  if (rightSeverityRank !== leftSeverityRank) {
    return rightSeverityRank - leftSeverityRank;
  }

  return left.id.localeCompare(right.id);
}

function projectCoordinatesToGlobe(
  latitude: number,
  longitude: number,
  rawGlobeView: DashboardGlobeView,
): Pick<DashboardMapMarker, "leftPercent" | "topPercent" | "depth" | "isVisible"> {
  const globeView = normalizeDashboardGlobeView(rawGlobeView);
  const latitudeRadians = toRadians(latitude);
  const longitudeDeltaRadians = toRadians(normalizeLongitude(longitude - globeView.rotationLongitude));
  const centerLatitudeRadians = toRadians(globeView.rotationLatitude);
  const cosLatitude = Math.cos(latitudeRadians);
  const x = cosLatitude * Math.sin(longitudeDeltaRadians);
  const y =
    Math.cos(centerLatitudeRadians) * Math.sin(latitudeRadians) -
    Math.sin(centerLatitudeRadians) * cosLatitude * Math.cos(longitudeDeltaRadians);
  const depth =
    Math.sin(centerLatitudeRadians) * Math.sin(latitudeRadians) +
    Math.cos(centerLatitudeRadians) * cosLatitude * Math.cos(longitudeDeltaRadians);
  const radiusPercent = 41 * globeView.zoom;

  return {
    leftPercent: clamp(50 + x * radiusPercent, MARKER_LEFT_MIN_PERCENT, MARKER_LEFT_MAX_PERCENT),
    topPercent: clamp(50 - y * radiusPercent, MARKER_TOP_MIN_PERCENT, MARKER_TOP_MAX_PERCENT),
    depth: Number(depth.toFixed(6)),
    isVisible: depth > -0.18,
  };
}

function spreadOverlappingDashboardMapMarkers(markers: DashboardMapMarker[]): DashboardMapMarker[] {
  const placedMarkers: DashboardMapMarker[] = [];

  return markers.map((marker) => {
    if (!marker.isVisible) {
      return marker;
    }

    const placedMarker = placeDashboardMapMarker(marker, placedMarkers);
    if (placedMarker.isVisible) {
      placedMarkers.push(placedMarker);
    }

    return placedMarker;
  });
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

  return { ...(leastOverlappedCandidate ?? marker), isVisible: false };
}

function buildMarkerPlacementCandidates(marker: DashboardMapMarker): DashboardMapMarker[] {
  const candidates: DashboardMapMarker[] = [];

  if (isDashboardMapMarkerAvailablePlacement(marker.leftPercent, marker.topPercent)) {
    candidates.push(marker);
  }

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
      if (!isDashboardMapMarkerAvailablePlacement(leftPercent, topPercent)) {
        continue;
      }

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

function isDashboardMapMarkerInsideGlobe(leftPercent: number, topPercent: number): boolean {
  return (leftPercent - 50) ** 2 + (topPercent - 50) ** 2 <= MARKER_GLOBE_RADIUS_PERCENT ** 2;
}

function isDashboardMapMarkerAvailablePlacement(leftPercent: number, topPercent: number): boolean {
  return (
    isDashboardMapMarkerInsideGlobe(leftPercent, topPercent) &&
    !MARKER_RESERVED_OVERLAY_AREAS.some((area) => isPointInsideMarkerReservedOverlayArea(leftPercent, topPercent, area))
  );
}

function isPointInsideMarkerReservedOverlayArea(
  leftPercent: number,
  topPercent: number,
  area: MarkerReservedOverlayArea,
): boolean {
  return (
    leftPercent >= area.minLeftPercent &&
    leftPercent <= area.maxLeftPercent &&
    topPercent >= area.minTopPercent &&
    topPercent <= area.maxTopPercent
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function normalizeLongitude(longitude: number): number {
  const normalized = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return normalized === -180 ? 180 : normalized;
}

function normalizeAreaSearchTerm(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function calculateCoordinateDistanceKm(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): number {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(haversine)));
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
