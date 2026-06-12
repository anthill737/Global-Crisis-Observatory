import type { Coordinates, Incident, IncidentCategory, PublicFeedId, SeverityLabel } from "./incidents";

export const SAVED_EVENTS_STORAGE_KEY = "global-crisis-dashboard.savedEvents.v1";

export interface SavedEventStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SavedEvent {
  version: 1;
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
  originalSourceId: string | null;
  sourceRetrievedAt: string | null;
  savedAt: string;
}

export interface SavedEventViewItem {
  savedEvent: SavedEvent;
  liveIncident: Incident | null;
  isLive: boolean;
  statusText: string;
}

const INCIDENT_CATEGORIES = new Set<IncidentCategory>([
  "earthquake",
  "wildfire",
  "severe_storm",
  "volcano",
  "flood",
  "sea_lake_ice",
  "drought",
  "dust_haze",
  "other",
]);
const PUBLIC_FEEDS = new Set<PublicFeedId>(["usgs-earthquakes", "nasa-eonet", "gdacs", "noaa-nws-alerts"]);
const SEVERITY_LABELS = new Set<SeverityLabel>(["minor", "moderate", "strong", "major"]);

export function createSavedEvent(incident: Incident, savedAt: string = new Date().toISOString()): SavedEvent {
  return {
    version: 1,
    id: incident.id,
    title: incident.title,
    category: incident.category,
    source: incident.source,
    sourceName: incident.sourceName,
    sourceUrl: incident.sourceUrl,
    coordinates: incident.coordinates === null ? null : { ...incident.coordinates },
    startedAt: incident.startedAt,
    updatedAt: incident.updatedAt,
    severityScore: incident.severityScore,
    severityLabel: incident.severityLabel,
    originalSourceId: incident.rawSource.originalId,
    sourceRetrievedAt: incident.rawSource.retrievedAt,
    savedAt,
  };
}

export function loadSavedEvents(storage: SavedEventStorageAdapter | null = getBrowserLocalStorage()): SavedEvent[] {
  if (storage === null) {
    return [];
  }

  let rawValue: string | null;
  try {
    rawValue = storage.getItem(SAVED_EVENTS_STORAGE_KEY);
  } catch {
    return [];
  }

  if (rawValue === null) {
    return [];
  }

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(rawValue);
  } catch {
    return [];
  }

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  return sortSavedEvents(dedupeSavedEvents(parsedValue.filter(isSavedEvent)));
}

export function persistSavedEvents(
  savedEvents: readonly SavedEvent[],
  storage: SavedEventStorageAdapter | null = getBrowserLocalStorage(),
): SavedEvent[] {
  const normalizedSavedEvents = sortSavedEvents(dedupeSavedEvents(savedEvents.filter(isSavedEvent)));
  if (storage === null) {
    return normalizedSavedEvents;
  }

  try {
    if (normalizedSavedEvents.length === 0) {
      storage.removeItem(SAVED_EVENTS_STORAGE_KEY);
    } else {
      storage.setItem(SAVED_EVENTS_STORAGE_KEY, JSON.stringify(normalizedSavedEvents));
    }
  } catch {
    return normalizedSavedEvents;
  }

  return normalizedSavedEvents;
}

export function saveIncidentAsSavedEvent(
  incident: Incident,
  options: { storage?: SavedEventStorageAdapter | null; savedAt?: string } = {},
): SavedEvent[] {
  const storage = Object.hasOwn(options, "storage") ? options.storage ?? null : getBrowserLocalStorage();
  const savedEvent = createSavedEvent(incident, options.savedAt ?? new Date().toISOString());
  const savedEvents = loadSavedEvents(storage).filter((existingSavedEvent) => existingSavedEvent.id !== savedEvent.id);

  return persistSavedEvents([savedEvent, ...savedEvents], storage);
}

export function removeSavedEvent(
  savedEventId: string,
  storage: SavedEventStorageAdapter | null = getBrowserLocalStorage(),
): SavedEvent[] {
  const nextSavedEvents = loadSavedEvents(storage).filter((savedEvent) => savedEvent.id !== savedEventId);
  return persistSavedEvents(nextSavedEvents, storage);
}

export function isIncidentSaved(savedEvents: readonly SavedEvent[], incidentId: string): boolean {
  return savedEvents.some((savedEvent) => savedEvent.id === incidentId);
}

export function buildSavedEventViewItems(savedEvents: readonly SavedEvent[], liveIncidents: readonly Incident[]): SavedEventViewItem[] {
  const liveIncidentById = new Map(liveIncidents.map((incident) => [incident.id, incident]));

  return sortSavedEvents(savedEvents).map((savedEvent) => {
    const liveIncident = liveIncidentById.get(savedEvent.id) ?? null;

    return {
      savedEvent,
      liveIncident,
      isLive: liveIncident !== null,
      statusText:
        liveIncident === null
          ? "No longer live in the current Public Feed refresh; showing saved source details."
          : "Live in the current Public Feed refresh.",
    };
  });
}

function dedupeSavedEvents(savedEvents: readonly SavedEvent[]): SavedEvent[] {
  const savedEventById = new Map<string, SavedEvent>();
  for (const savedEvent of savedEvents) {
    const existingSavedEvent = savedEventById.get(savedEvent.id);
    if (
      existingSavedEvent === undefined ||
      Date.parse(savedEvent.savedAt) >= Date.parse(existingSavedEvent.savedAt)
    ) {
      savedEventById.set(savedEvent.id, savedEvent);
    }
  }

  return [...savedEventById.values()];
}

function sortSavedEvents(savedEvents: readonly SavedEvent[]): SavedEvent[] {
  return [...savedEvents].sort((left, right) => {
    const savedAtOrder = Date.parse(right.savedAt) - Date.parse(left.savedAt);
    return savedAtOrder === 0 ? left.title.localeCompare(right.title) : savedAtOrder;
  });
}

function isSavedEvent(value: unknown): value is SavedEvent {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.version === 1 &&
    typeof value.id === "string" &&
    value.id.trim() !== "" &&
    typeof value.title === "string" &&
    value.title.trim() !== "" &&
    typeof value.category === "string" &&
    INCIDENT_CATEGORIES.has(value.category as IncidentCategory) &&
    typeof value.source === "string" &&
    PUBLIC_FEEDS.has(value.source as PublicFeedId) &&
    typeof value.sourceName === "string" &&
    value.sourceName.trim() !== "" &&
    isNullableString(value.sourceUrl) &&
    isCoordinates(value.coordinates) &&
    isIsoLikeString(value.startedAt) &&
    isNullableString(value.updatedAt) &&
    isNullableNumber(value.severityScore) &&
    isNullableSeverityLabel(value.severityLabel) &&
    isNullableString(value.originalSourceId) &&
    isNullableString(value.sourceRetrievedAt) &&
    isIsoLikeString(value.savedAt)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isIsoLikeString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNullableSeverityLabel(value: unknown): value is SeverityLabel | null {
  return value === null || (typeof value === "string" && SEVERITY_LABELS.has(value as SeverityLabel));
}

function isCoordinates(value: unknown): value is Coordinates | null {
  if (value === null) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180
  );
}

function getBrowserLocalStorage(): SavedEventStorageAdapter | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}
