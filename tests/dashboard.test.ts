import { describe, expect, it } from "vitest";
import {
  buildGlobalCrisisDashboardViewModel,
  formatCategoryLabel,
  formatDashboardTimestamp,
} from "../src/dashboard";
import type { CombinedIncidentCollection, Incident, SourceStatus } from "../src/lib/incidents";

const refreshedAt = "2026-06-10T15:30:00.000Z";

const sourceStatuses: SourceStatus[] = [
  {
    publicFeed: "usgs-earthquakes",
    publicFeedName: "USGS Earthquakes",
    state: "success",
    lastAttemptedAt: refreshedAt,
    lastSuccessfulAt: refreshedAt,
    message: null,
  },
  {
    publicFeed: "nasa-eonet",
    publicFeedName: "NASA EONET",
    state: "degraded",
    lastAttemptedAt: refreshedAt,
    lastSuccessfulAt: null,
    message: "NASA EONET returned a payload without an events list.",
  },
];

const incidents: Incident[] = [
  {
    id: "usgs-earthquakes:alpha",
    title: "M 5.4 - 12 km S of Example, Alaska",
    category: "earthquake",
    source: "usgs-earthquakes",
    sourceName: "USGS Earthquakes",
    sourceUrl: "https://earthquake.usgs.gov/earthquakes/eventpage/alpha",
    coordinates: { latitude: 61.2, longitude: -149.9 },
    startedAt: "2026-06-10T12:00:00.000Z",
    updatedAt: "2026-06-10T13:00:00.000Z",
    severityScore: 54,
    severityLabel: "strong",
    rawSource: {
      publicFeed: "usgs-earthquakes",
      publicFeedName: "USGS Earthquakes",
      originalId: "alpha",
      retrievedAt: refreshedAt,
      payload: { id: "alpha" },
    },
  },
  {
    id: "nasa-eonet:bravo",
    title: "Wildfire activity in British Columbia, Canada",
    category: "wildfire",
    source: "nasa-eonet",
    sourceName: "NASA EONET",
    sourceUrl: null,
    coordinates: { latitude: 53.7, longitude: -123.1 },
    startedAt: "2026-06-09T18:30:00.000Z",
    updatedAt: null,
    severityScore: 90,
    severityLabel: "major",
    rawSource: {
      publicFeed: "nasa-eonet",
      publicFeedName: "NASA EONET",
      originalId: "bravo",
      retrievedAt: refreshedAt,
      payload: { id: "bravo" },
    },
  },
];

function createCollection(overrides: Partial<CombinedIncidentCollection> = {}): CombinedIncidentCollection {
  return {
    incidents,
    sourceStatuses,
    sourceStatusSummary: {
      sourceCount: 2,
      successCount: 1,
      degradedCount: 1,
      unavailableCount: 0,
      lastAttemptedAt: refreshedAt,
      lastSuccessfulAt: refreshedAt,
    },
    refreshedAt,
    ...overrides,
  };
}

describe("Global Crisis Dashboard shell view model", () => {
  it("builds a Global Crisis Observatory command-center model from live pipeline Incidents", () => {
    const viewModel = buildGlobalCrisisDashboardViewModel(createCollection(), { sources: ["nasa-eonet"] });

    expect(viewModel.title).toBe("Global Crisis Observatory");
    expect(viewModel.incidents).toHaveLength(2);
    expect(viewModel.filteredIncidentSet).toHaveLength(1);
    expect(viewModel.filteredIncidentSet[0]?.id).toBe("nasa-eonet:bravo");
    expect(viewModel.mapMarkers).toEqual([
      expect.objectContaining({
        id: "nasa-eonet:bravo",
        category: "wildfire",
        leftPercent: expect.any(Number),
        topPercent: expect.any(Number),
      }),
    ]);
    expect(viewModel.metrics.map((metric) => metric.label)).toEqual([
      "Filtered Incident Set",
      "Public Feeds Online",
      "Source Status Attention",
      "Last Refresh",
    ]);
    expect(viewModel.hasDegradedSourceStatus).toBe(true);
  });

  it("keeps empty and degraded states explicit when Public Feeds return no Incidents", () => {
    const emptyCollection = createCollection({
      incidents: [],
      sourceStatuses: sourceStatuses.map((sourceStatus) => ({ ...sourceStatus, state: "unavailable" })),
      sourceStatusSummary: {
        sourceCount: 2,
        successCount: 0,
        degradedCount: 0,
        unavailableCount: 2,
        lastAttemptedAt: refreshedAt,
        lastSuccessfulAt: null,
      },
    });

    const viewModel = buildGlobalCrisisDashboardViewModel(emptyCollection);

    expect(viewModel.hasIncidents).toBe(false);
    expect(viewModel.hasFilteredIncidentSet).toBe(false);
    expect(viewModel.hasDegradedSourceStatus).toBe(true);
    expect(viewModel.mapMarkers).toEqual([]);
    expect(viewModel.metrics).toContainEqual(
      expect.objectContaining({
        label: "Source Status Attention",
        value: "2",
        tone: "critical",
      }),
    );
  });

  it("formats labels and timestamps for dashboard display", () => {
    expect(formatCategoryLabel("sea_lake_ice")).toBe("Sea Lake Ice");
    expect(formatDashboardTimestamp(null)).toBe("Not yet available");
    expect(formatDashboardTimestamp("not-a-date")).toBe("Unknown time");
  });
});
