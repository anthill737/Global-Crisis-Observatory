// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildIncidentDetailMetricFields,
  buildGlobalCrisisDashboardViewModel,
  createIdleAreaSearchResolution,
  findSelectedDashboardMapMarker,
  focusGlobeViewOnAreaSearchArea,
  formatCategoryLabel,
  formatDashboardTimestamp,
  normalizeDashboardGlobeView,
  resolveAreaSearchQuery,
  resolveSelectedIncidentId,
} from "../src/dashboard";
import {
  AiBriefingConfigurationError,
  type AiBriefingOutput,
  type AiBriefingRequestPayload,
  type generateAiBriefing,
} from "../src/lib/ai-briefing";
import { AI_BRIEFING_CHOICE_STORAGE_KEY } from "../src/lib/ai-briefing-choice";
import {
  GDACS_BROWSER_RUNTIME_LIMITATION_MESSAGE,
  normalizeNasaEonetIncident,
  normalizeUsgsEarthquakeIncident,
  type CombinedIncidentCollection,
  type Incident,
  type NasaEonetIncidentPayload,
  type SourceStatus,
  type UsgsEarthquakeFeedPayload,
} from "../src/lib/incidents";
import { SAVED_EVENTS_STORAGE_KEY, createSavedEvent } from "../src/lib/saved-events";

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
      payload: { id: "alpha", properties: { mag: 5.4 } },
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

beforeEach(() => {
  Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../src/lib/ai-briefing");
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  window.localStorage.clear();
  delete document.documentElement.dataset.visibilityMode;
});

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

function loadUsgsFixtureIncident(): Incident {
  const payload = JSON.parse(
    readFileSync("tests/fixtures/usgs-earthquakes.json", "utf8"),
  ) as UsgsEarthquakeFeedPayload;
  const feature = payload.features?.[0];
  if (feature === undefined) {
    throw new Error("USGS Earthquakes fixture is missing its first feature.");
  }

  const incident = normalizeUsgsEarthquakeIncident(feature, { retrievedAt: refreshedAt });
  if (incident === null) {
    throw new Error("USGS Earthquakes fixture did not normalize into an Incident.");
  }

  return incident;
}

function buildNasaEonetFixtureIncident(): Incident {
  const payload: NasaEonetIncidentPayload = {
    id: "EONET_7777",
    title: "Wildfire activity in British Columbia, Canada",
    categories: [{ id: "wildfires", title: "Wildfires" }],
    sources: [],
    geometry: [
      {
        date: "2026-06-09T18:30:00.000Z",
        type: "Point",
        coordinates: [-123.1, 53.7],
      },
    ],
  };
  const incident = normalizeNasaEonetIncident(payload, { retrievedAt: refreshedAt });
  if (incident === null) {
    throw new Error("NASA EONET fixture did not normalize into an Incident.");
  }

  return incident;
}

function buildGdacsFixtureIncident(): Incident {
  return {
    ...incidents[0]!,
    id: "gdacs:tc-2026-001",
    title: "GDACS tropical cyclone advisory",
    category: "severe_storm",
    source: "gdacs",
    sourceName: "GDACS",
    sourceUrl: "https://www.gdacs.org/",
    coordinates: { latitude: 14.5, longitude: 121.0 },
    rawSource: {
      publicFeed: "gdacs",
      publicFeedName: "GDACS",
      originalId: "tc-2026-001",
      retrievedAt: refreshedAt,
      payload: { id: "tc-2026-001" },
    },
  };
}

function stubPublicFeedFetchForMainImport(): void {
  const usgsPayload = JSON.parse(
    readFileSync("tests/fixtures/usgs-earthquakes.json", "utf8"),
  ) as UsgsEarthquakeFeedPayload;
  const nasaPayload = { title: "EONET Events", events: [] };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const endpoint = String(input);
      if (endpoint.includes("gdacs")) {
        throw new Error("Failed to fetch");
      }
      return {
        ok: true,
        json: async () => (endpoint.includes("eonet") ? nasaPayload : usgsPayload),
      };
    }),
  );
}

function stubPublicFeedFetchWithNasaEonetFailure(): void {
  const usgsPayload = JSON.parse(
    readFileSync("tests/fixtures/usgs-earthquakes.json", "utf8"),
  ) as UsgsEarthquakeFeedPayload;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const endpoint = String(input);

      if (endpoint.includes("eonet")) {
        throw new Error("NASA EONET outage");
      }
      if (endpoint.includes("gdacs")) {
        throw new Error("Failed to fetch");
      }

      return {
        ok: true,
        json: async () => usgsPayload,
      };
    }),
  );
}

function stubPublicFeedFetchWithRestoredFeedSuccess(): void {
  const usgsPayload = JSON.parse(
    readFileSync("tests/fixtures/usgs-earthquakes.json", "utf8"),
  ) as UsgsEarthquakeFeedPayload;
  const nasaPayload = {
    title: "EONET Events",
    events: [
      {
        id: "EONET_9876",
        title: "Flooding in Queensland, Australia",
        link: "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_9876",
        categories: [{ id: "floods", title: "Floods" }],
        sources: [{ id: "NASA_DISASTERS", url: "https://disasters.nasa.gov/example-flood" }],
        geometry: [
          {
            date: "2026-06-08T04:15:00Z",
            type: "Point",
            coordinates: [149.2, -21.4],
          },
        ],
      },
    ],
  };
  const gdacsRss = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <item>
          <title><![CDATA[Orange tropical cyclone alert for Example Islands]]></title>
          <link>https://www.gdacs.org/report.aspx?eventid=1001&amp;episodeid=2&amp;eventtype=TC</link>
          <guid>TC-1001-2</guid>
          <pubDate>Wed, 10 Jun 2026 09:00:00 GMT</pubDate>
          <gdacs:eventtype>TC</gdacs:eventtype>
          <gdacs:alertlevel>Orange</gdacs:alertlevel>
          <geo:lat>14.5</geo:lat>
          <geo:long>121</geo:long>
        </item>
      </channel>
    </rss>`;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const endpoint = String(input);

      if (endpoint.includes("eonet")) {
        return { ok: true, status: 200, json: async () => nasaPayload };
      }
      if (endpoint.includes("gdacs")) {
        return { ok: true, status: 200, json: async () => ({}), text: async () => gdacsRss };
      }

      return { ok: true, status: 200, json: async () => usgsPayload };
    }),
  );
}

async function renderIncidentDetailMarkup(incident: Incident): Promise<HTMLElement> {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  stubPublicFeedFetchForMainImport();

  const { renderIncidentDetail } = await import("../src/main");
  const container = document.createElement("section");
  container.innerHTML = renderIncidentDetail(incident, []);
  return container;
}

async function renderDashboardApp(): Promise<HTMLElement> {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  stubPublicFeedFetchForMainImport();

  await import("../src/main");
  await flushDashboardRefresh();

  const app = document.querySelector<HTMLElement>("#app");
  if (app === null) {
    throw new Error("Dashboard app root was not rendered.");
  }
  return app;
}

async function renderDashboardAppWithNasaEonetFailure(): Promise<HTMLElement> {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  stubPublicFeedFetchWithNasaEonetFailure();

  await import("../src/main");
  await flushDashboardRefresh();

  const app = document.querySelector<HTMLElement>("#app");
  if (app === null) {
    throw new Error("Dashboard app root was not rendered.");
  }
  return app;
}

async function renderDashboardAppWithRestoredFeedSuccess(): Promise<HTMLElement> {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  stubPublicFeedFetchWithRestoredFeedSuccess();

  await import("../src/main");
  await flushDashboardRefresh();

  const app = document.querySelector<HTMLElement>("#app");
  if (app === null) {
    throw new Error("Dashboard app root was not rendered.");
  }
  return app;
}

async function renderDashboardAppWithAiBriefingMock(
  generateAiBriefingMock: typeof generateAiBriefing,
  aiBriefingChoice = "openai",
): Promise<HTMLElement> {
  vi.resetModules();
  vi.doMock("../src/lib/ai-briefing", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../src/lib/ai-briefing")>();
    return {
      ...actual,
      generateAiBriefing: generateAiBriefingMock,
    };
  });
  document.body.innerHTML = '<div id="app"></div>';
  window.localStorage.setItem(AI_BRIEFING_CHOICE_STORAGE_KEY, aiBriefingChoice);
  stubPublicFeedFetchForMainImport();

  await import("../src/main");
  await flushDashboardRefresh();

  const app = document.querySelector<HTMLElement>("#app");
  if (app === null) {
    throw new Error("Dashboard app root was not rendered.");
  }
  return app;
}

async function flushDashboardRefresh(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

function getAiBriefingRequestControl(app: HTMLElement, scope: "single-incident" | "filtered-incident-set"): HTMLButtonElement {
  const button = app.querySelector<HTMLButtonElement>(`[data-request-ai-briefing="${scope}"]`);
  if (button === null) {
    throw new Error(`Expected ${scope} AI Briefing control.`);
  }
  return button;
}

function getAiBriefingStatus(app: HTMLElement): HTMLElement {
  const status = app.querySelector<HTMLElement>(".ai-briefing-status");
  if (status === null) {
    throw new Error("Expected AI Briefing status region.");
  }
  return status;
}

function expectDefined<T>(value: T | undefined): T {
  expect(value).toBeDefined();
  if (value === undefined) {
    throw new Error("Expected value to be defined.");
  }
  return value;
}

function getDefinedElement<T extends Element>(element: T | null): T {
  expect(element).not.toBeNull();
  if (element === null) {
    throw new Error("Expected element to be rendered.");
  }
  return element;
}

function expectDetailField(container: HTMLElement, label: string, value: string): void {
  const labelElement = Array.from(container.querySelectorAll("dt")).find((element) => element.textContent === label);
  expect(labelElement, `Expected Incident Detail field "${label}" to be rendered.`).toBeTruthy();
  expect(labelElement?.parentElement?.querySelector("dd")?.textContent?.trim()).toBe(value);
}

function getSavedEventToggle(app: HTMLElement, incidentId: string, surface: "feed" | "map" | "detail"): HTMLButtonElement {
  const button = app.querySelector<HTMLButtonElement>(
    `[data-toggle-saved-event="${incidentId}"][data-save-surface="${surface}"]`,
  );
  if (button === null) {
    throw new Error(`Expected ${surface} Saved Event toggle for ${incidentId}.`);
  }
  return button;
}

function getSavedEventToggleStatus(button: HTMLButtonElement): string {
  return button.closest(".saved-event-toggle")?.querySelector(".saved-event-status")?.textContent?.trim() ?? "";
}

function getSavedEventToggleState(button: HTMLButtonElement): string {
  return button.closest(".saved-event-toggle")?.getAttribute("data-saved-state") ?? "";
}

function getSavedEventCard(app: HTMLElement, savedEventId: string): HTMLElement {
  const card = app.querySelector<HTMLElement>(`[data-saved-event-id="${savedEventId}"]`);
  if (card === null) {
    throw new Error(`Expected Saved Event card for ${savedEventId}.`);
  }
  return card;
}

describe("Global Crisis Dashboard shell view model", () => {
  it("builds a Global Crisis Observatory model from live pipeline Incidents", () => {
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

  it("renders reachable Incidents and explicit unavailable Source Status when one Public Feed fails", async () => {
    const app = await renderDashboardAppWithNasaEonetFailure();
    const sourceStatusCards = Array.from(app.querySelectorAll<HTMLElement>(".source-status-card"));
    const nasaEonetSourceStatus = sourceStatusCards.find((card) => card.textContent?.includes("NASA EONET"));

    expect(app.querySelector(".hero-status")?.textContent).toContain("Degraded");
    expect(app.textContent).toContain("M 5.4 - 12 km S of Example, Alaska");
    expect(app.textContent).toContain("M 2.1 - 4 km W of Example, California");
    expect(nasaEonetSourceStatus).toBeDefined();
    expect(nasaEonetSourceStatus?.dataset.state).toBe("unavailable");
    expect(nasaEonetSourceStatus?.textContent).toContain("Unavailable");
    expect(nasaEonetSourceStatus?.textContent).toContain("NASA EONET fetch failed: NASA EONET outage.");
    expect(nasaEonetSourceStatus?.textContent).toContain("Last attempted refresh:");
    expect(nasaEonetSourceStatus?.textContent).toContain("Latest successful refresh: Not yet available");
  });

  it("renders the GDACS browser runtime limitation in Source Status without removing reachable Incidents", async () => {
    const app = await renderDashboardApp();
    const sourceStatusCards = Array.from(app.querySelectorAll<HTMLElement>(".source-status-card"));
    const gdacsSourceStatus = sourceStatusCards.find((card) => card.textContent?.includes("GDACS"));

    expect(app.textContent).toContain("M 5.4 - 12 km S of Example, Alaska");
    expect(app.textContent).toContain("M 2.1 - 4 km W of Example, California");
    expect(gdacsSourceStatus).toBeDefined();
    expect(gdacsSourceStatus?.dataset.state).toBe("unavailable");
    expect(gdacsSourceStatus?.textContent).toContain("Unavailable");
    expect(gdacsSourceStatus?.textContent).toContain(GDACS_BROWSER_RUNTIME_LIMITATION_MESSAGE);
  });

  it("renders restored Public Feed success Source Status messaging for USGS, NASA EONET, and GDACS", async () => {
    const app = await renderDashboardAppWithRestoredFeedSuccess();
    const sourceStatusCards = Array.from(app.querySelectorAll<HTMLElement>(".source-status-card"));
    const cardsByPublicFeed = new Map(
      sourceStatusCards.map((card) => [card.querySelector("strong")?.textContent ?? "", card]),
    );

    expect(app.querySelector(".hero-status")?.textContent).toContain("Operational");
    expect(app.textContent).toContain("M 5.4 - 12 km S of Example, Alaska");
    expect(app.textContent).toContain("Flooding in Queensland, Australia");
    expect(app.textContent).toContain("Orange tropical cyclone alert for Example Islands");
    expect(cardsByPublicFeed.get("USGS Earthquakes")?.dataset.state).toBe("success");
    expect(cardsByPublicFeed.get("NASA EONET")?.dataset.state).toBe("success");
    expect(cardsByPublicFeed.get("GDACS")?.dataset.state).toBe("success");
    for (const publicFeedName of ["USGS Earthquakes", "NASA EONET", "GDACS"]) {
      const card = cardsByPublicFeed.get(publicFeedName);
      expect(card?.textContent).toContain("Success");
      expect(card?.textContent).toContain("Public Feed refreshed successfully.");
      expect(card?.textContent).toContain("Latest successful refresh:");
    }
  });

  it("formats labels and timestamps for dashboard display", () => {
    expect(formatCategoryLabel("sea_lake_ice")).toBe("Sea Lake Ice");
    expect(formatDashboardTimestamp(null)).toBe("Not yet available");
    expect(formatDashboardTimestamp("not-a-date")).toBe("Unknown time");
  });

  it("keeps map and feed selection empty until the user selects an Incident", () => {
    const viewModel = buildGlobalCrisisDashboardViewModel(createCollection(), { categories: ["wildfire"] });
    const selectedIncidentId = resolveSelectedIncidentId(viewModel.filteredIncidentSet, null);
    const selectedMarker = findSelectedDashboardMapMarker(viewModel.mapMarkers, selectedIncidentId);

    expect(selectedIncidentId).toBeNull();
    expect(selectedMarker).toBeNull();
  });

  it("preserves a selected Incident only while it remains in the Filtered Incident Set", () => {
    const viewModel = buildGlobalCrisisDashboardViewModel(createCollection(), { categories: ["wildfire"] });

    expect(resolveSelectedIncidentId(viewModel.filteredIncidentSet, "nasa-eonet:bravo")).toBe("nasa-eonet:bravo");
    expect(resolveSelectedIncidentId(viewModel.filteredIncidentSet, "usgs-earthquakes:alpha")).toBeNull();
    expect(findSelectedDashboardMapMarker(viewModel.mapMarkers, "nasa-eonet:bravo")).toEqual(
      expect.objectContaining({
        id: "nasa-eonet:bravo",
        category: "wildfire",
        severityLabel: "major",
      }),
    );
  });

  it("projects Incident Markers through a normalized zoomable Globe Map view", () => {
    const normalizedGlobeView = normalizeDashboardGlobeView({
      rotationLongitude: 540,
      rotationLatitude: 120,
      zoom: 9,
    });
    const baselineViewModel = buildGlobalCrisisDashboardViewModel(createCollection(), {}, normalizedGlobeView);
    const zoomedViewModel = buildGlobalCrisisDashboardViewModel(createCollection(), {}, {
      ...normalizedGlobeView,
      zoom: 0.78,
    });
    const baselineMarker = expectDefined(
      baselineViewModel.mapMarkers.find((marker) => marker.id === "usgs-earthquakes:alpha"),
    );
    const zoomedMarker = expectDefined(zoomedViewModel.mapMarkers.find((marker) => marker.id === baselineMarker.id));

    expect(normalizedGlobeView).toEqual({
      rotationLongitude: 180,
      rotationLatitude: 68,
      zoom: 1.72,
    });
    expect(baselineMarker).toEqual(
      expect.objectContaining({
        category: "earthquake",
        severityLabel: "strong",
        severityScore: 54,
        sourceName: "USGS Earthquakes",
      }),
    );
    expect(`${baselineMarker.leftPercent},${baselineMarker.topPercent}`).not.toBe(
      `${zoomedMarker.leftPercent},${zoomedMarker.topPercent}`,
    );
  });

  it("renders open Earth geography on a spherical Globe Map and updates it through spin and zoom controls", async () => {
    const app = await renderDashboardApp();
    const geography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    const landPath = getDefinedElement(geography.querySelector<SVGPathElement>(".map-geography__feature--land"));
    const initialPathData = landPath.getAttribute("d");

    expect(geography.dataset.openGeography).toContain("Natural Earth");
    expect(geography.getAttribute("role")).toBe("img");
    expect(app.querySelector(".map-landmass")).toBeNull();
    expect(geography.querySelectorAll(".map-geography__feature--land").length).toBeGreaterThan(2);
    expect(geography.querySelectorAll(".map-geography__feature--boundary").length).toBeGreaterThan(0);
    expect(app.querySelector(".map-viewport")?.classList.contains("map-geography")).toBe(false);

    app.querySelector<HTMLButtonElement>('[data-globe-control="spin-east"]')?.click();
    app.querySelector<HTMLButtonElement>('[data-globe-control="zoom-in"]')?.click();

    const updatedGeography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    const updatedLandPath = getDefinedElement(updatedGeography.querySelector<SVGPathElement>(".map-geography__feature--land"));
    expect(app.querySelector(".globe-control-status")?.textContent).toContain("Center 18°, -81° · 116% zoom");
    expect(updatedGeography.dataset.globeCenterLongitude).toBe("-81.00");
    expect(updatedGeography.dataset.globeZoom).toBe("1.16");
    expect(updatedLandPath.getAttribute("d")).not.toBe(initialPathData);
  });

  it("syncs Incident Detail and selected marker state when an Incident Marker is clicked on the Globe Map", async () => {
    const incidentId = "usgs-earthquakes:us7000abcd";
    const scrollIntoView = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const app = await renderDashboardApp();
    const marker = getDefinedElement(
      app.querySelector<HTMLButtonElement>(`[data-select-incident="${incidentId}"][data-selection-surface="map"]`),
    );

    expect(app.querySelector("[data-selected-incident-id]")).toBeNull();
    expect(marker.classList.contains("map-marker--selected")).toBe(false);
    expect(marker.getAttribute("aria-pressed")).toBe("false");

    marker.click();

    const detailCard = getDefinedElement(app.querySelector<HTMLElement>("[data-selected-incident-id]"));
    const selectedMarker = getDefinedElement(app.querySelector<HTMLButtonElement>(".map-marker--selected"));
    expect(detailCard.getAttribute("data-selected-incident-id")).toBe(incidentId);
    expect(detailCard.textContent).toContain("M 5.4 - 12 km S of Example, Alaska");
    expect(detailCard.textContent).toContain("USGS Earthquakes");
    expect(selectedMarker.getAttribute("data-select-incident")).toBe(incidentId);
    expect(selectedMarker.getAttribute("data-selection-surface")).toBe("map");
    expect(selectedMarker.getAttribute("aria-pressed")).toBe("true");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "nearest" });
    expect(app.querySelector(".map-canvas--focused")?.textContent).toContain(
      "Globe Map focused on M 5.4 - 12 km S of Example, Alaska.",
    );
  });

  it("resolves Area Search into Globe Map focus and nearby Incident emphasis", () => {
    const resolution = resolveAreaSearchQuery("British Columbia", incidents);

    expect(resolution.status).toBe("success");
    if (resolution.status !== "success") {
      throw new Error("Expected successful Area Search resolution.");
    }

    expect(resolution.area.label).toBe("British Columbia, Canada");
    expect(resolution.nearbyIncidents).toEqual([
      expect.objectContaining({
        incident: expect.objectContaining({ id: "nasa-eonet:bravo" }),
        distanceKm: expect.any(Number),
      }),
    ]);
    const focusedGlobeView = focusGlobeViewOnAreaSearchArea(resolution.area, {
      rotationLatitude: 0,
      rotationLongitude: 0,
      zoom: 1,
    });
    expect(focusedGlobeView.rotationLatitude).toBeCloseTo(53.7267, 4);
    expect(focusedGlobeView.rotationLongitude).toBeCloseTo(-127.6476, 4);
    expect(focusedGlobeView.zoom).toBe(1.28);
  });

  it("returns explicit Area Search no-result, ambiguous-result, and lookup-failure states", () => {
    const noResult = resolveAreaSearchQuery("Atlantis", incidents);
    const ambiguous = resolveAreaSearchQuery("Alaska region", incidents);
    const failure = resolveAreaSearchQuery("x".repeat(121), incidents);

    expect(createIdleAreaSearchResolution()).toEqual(
      expect.objectContaining({
        status: "idle",
        message: expect.stringContaining("Enter a place or region"),
      }),
    );
    expect(noResult).toEqual(
      expect.objectContaining({
        status: "no-result",
        message: expect.stringContaining("No Area Search match"),
      }),
    );
    expect(ambiguous).toEqual(
      expect.objectContaining({
        status: "ambiguous",
        candidates: expect.arrayContaining([
          expect.objectContaining({ label: "Alaska, United States" }),
          expect.objectContaining({ label: "Gulf of Alaska" }),
        ]),
      }),
    );
    expect(failure).toEqual(
      expect.objectContaining({
        status: "failure",
        message: expect.stringContaining("Area Search lookup failed"),
      }),
    );
  });

  it("extracts public event-specific fields for the Incident Detail view", () => {
    expect(buildIncidentDetailMetricFields(incidents[0]!)).toEqual([
      {
        label: "Earthquake magnitude",
        value: "5.4",
        sourceName: "USGS Earthquakes",
      },
    ]);
    expect(buildIncidentDetailMetricFields(incidents[1]!)).toEqual([]);
  });

  it("renders Incident Detail visible fields for full-data USGS Earthquakes Incidents", async () => {
    const incident = loadUsgsFixtureIncident();
    const container = await renderIncidentDetailMarkup(incident);

    expect(container.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incident.id);
    expect(container.querySelector("h3")?.textContent).toBe("M 5.4 - 12 km S of Example, Alaska");
    expectDetailField(container, "Public Feed", "USGS Earthquakes");
    expectDetailField(container, "Category", "Earthquake");
    expectDetailField(container, "Severity Score", "strong · 54");
    expectDetailField(container, "Location", "61.2000, -149.9000");
    expectDetailField(container, "Source record", "USGS Earthquakes source record us7000abcd · Retrieved Jun 10, 2026, 3:30 PM");
    expect(container.querySelector('a[href="https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd"]')?.textContent).toBe(
      "Open source attribution",
    );
    expectDetailField(container, "Earthquake magnitude", "5.4 from USGS Earthquakes");
    expect(container.querySelector(".incident-detail-metrics .fallback-text")).toBeNull();
  });

  it("renders Incident Detail fallback text for partial NASA EONET Incidents", async () => {
    const incident = buildNasaEonetFixtureIncident();
    const container = await renderIncidentDetailMarkup(incident);

    expect(container.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe("nasa-eonet:EONET_7777");
    expect(container.querySelector("h3")?.textContent).toBe("Wildfire activity in British Columbia, Canada");
    expectDetailField(container, "Public Feed", "NASA EONET");
    expectDetailField(container, "Category", "Wildfire");
    expectDetailField(container, "Severity Score", "strong · 65");
    expectDetailField(container, "Location", "53.7000, -123.1000");
    expectDetailField(container, "Updated", "Not yet available");
    expectDetailField(container, "Source link", "Source link unavailable from NASA EONET.");
    expectDetailField(container, "Source record", "NASA EONET source record EONET_7777 · Retrieved Jun 10, 2026, 3:30 PM");
    expect(container.querySelector(".incident-detail-metrics .fallback-text")?.textContent).toBe(
      "No event-specific metrics were published by NASA EONET for this Incident.",
    );
    expect(container.querySelector(".incident-detail-metrics dl")).toBeNull();
  });

  it("renders Incident Detail missing-field states without hiding source attribution", async () => {
    const fixtureIncident = loadUsgsFixtureIncident();
    const missingFieldIncident: Incident = {
      ...fixtureIncident,
      coordinates: null,
      sourceUrl: null,
      severityScore: null,
      severityLabel: null,
      updatedAt: null,
      rawSource: {
        ...fixtureIncident.rawSource,
        originalId: null,
        retrievedAt: null,
        payload: {},
      },
    };

    const container = await renderIncidentDetailMarkup(missingFieldIncident);

    expect(container.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(missingFieldIncident.id);
    expectDetailField(container, "Severity Score", "unscored");
    expectDetailField(container, "Location", "Location unavailable");
    expectDetailField(container, "Updated", "Not yet available");
    expectDetailField(container, "Source link", "Source link unavailable from USGS Earthquakes.");
    expectDetailField(container, "Source record", "USGS Earthquakes source record ID unavailable · Retrieved Not yet available");
    expect(container.querySelector(".incident-detail-metrics .fallback-text")?.textContent).toBe(
      "No event-specific metrics were published by USGS Earthquakes for this Incident.",
    );
    expect(container.querySelector(".incident-detail-metrics dl")).toBeNull();
  });

  it("toggles the same Saved Event from feed, Globe Map, and Incident Detail without losing selected map focus", async () => {
    const incidentId = "usgs-earthquakes:us7000abcd";
    const app = await renderDashboardApp();

    const feedSaveButton = getSavedEventToggle(app, incidentId, "feed");
    expect(getSavedEventToggleStatus(feedSaveButton)).toBe("Not saved");
    expect(getSavedEventToggleState(feedSaveButton)).toBe("unsaved");

    feedSaveButton.click();

    const feedUnsaveButton = getSavedEventToggle(app, incidentId, "feed");
    expect(feedUnsaveButton.dataset.savedEventAction).toBe("unsave");
    expect(getSavedEventToggleStatus(feedUnsaveButton)).toBe("Saved Event");
    expect(getSavedEventToggleState(feedUnsaveButton)).toBe("saved");
    expect(JSON.parse(window.localStorage.getItem(SAVED_EVENTS_STORAGE_KEY) ?? "[]")).toEqual([
      expect.objectContaining({ id: incidentId }),
    ]);

    app.querySelector<HTMLButtonElement>(`[data-select-incident="${incidentId}"][data-selection-surface="feed"]`)?.click();

    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
    expect(app.querySelector(".map-canvas--focused")).not.toBeNull();
    expect(app.querySelector(".map-marker--selected")?.getAttribute("data-select-incident")).toBe(incidentId);
    expect(getSavedEventToggleStatus(getSavedEventToggle(app, incidentId, "map"))).toBe("Saved Event");
    expect(getSavedEventToggleStatus(getSavedEventToggle(app, incidentId, "detail"))).toBe("Saved Event");
    expect(getSavedEventToggleState(getSavedEventToggle(app, incidentId, "map"))).toBe("saved");
    expect(getSavedEventToggleState(getSavedEventToggle(app, incidentId, "detail"))).toBe("saved");

    getSavedEventToggle(app, incidentId, "map").click();

    expect(window.localStorage.getItem(SAVED_EVENTS_STORAGE_KEY)).toBeNull();
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
    expect(app.querySelector(".map-canvas--focused")).not.toBeNull();
    expect(app.querySelector(".map-marker--selected")?.getAttribute("data-select-incident")).toBe(incidentId);
    expect(getSavedEventToggleStatus(getSavedEventToggle(app, incidentId, "feed"))).toBe("Not saved");
    expect(getSavedEventToggleStatus(getSavedEventToggle(app, incidentId, "detail"))).toBe("Not saved");
    expect(getSavedEventToggleState(getSavedEventToggle(app, incidentId, "feed"))).toBe("unsaved");
    expect(getSavedEventToggleState(getSavedEventToggle(app, incidentId, "detail"))).toBe("unsaved");

    getSavedEventToggle(app, incidentId, "detail").click();

    expect(JSON.parse(window.localStorage.getItem(SAVED_EVENTS_STORAGE_KEY) ?? "[]")).toEqual([
      expect.objectContaining({ id: incidentId }),
    ]);
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
    expect(app.querySelector(".map-marker--selected")?.getAttribute("data-select-incident")).toBe(incidentId);
    expect(getSavedEventToggleStatus(getSavedEventToggle(app, incidentId, "feed"))).toBe("Saved Event");
    expect(getSavedEventToggleStatus(getSavedEventToggle(app, incidentId, "map"))).toBe("Saved Event");
    expect(getSavedEventToggleStatus(getSavedEventToggle(app, incidentId, "detail"))).toBe("Saved Event");
  });

  it("renders source attribution across the Globe Map, feed cards, Incident Detail, Saved Events View, and AI Briefing context", async () => {
    const incidentId = "usgs-earthquakes:us7000abcd";
    const app = await renderDashboardApp();

    const feedCard = getDefinedElement(app.querySelector<HTMLElement>(`[data-incident-id="${incidentId}"]`));
    expect(feedCard.querySelector(".source-attribution")?.textContent).toContain("USGS Earthquakes");
    expect(app.querySelector(".map-source-legend")?.textContent).toContain("USGS Earthquakes");
    expect(
      app.querySelector(`[data-select-incident="${incidentId}"][data-selection-surface="map"]`)?.textContent,
    ).toContain("USGS");
    expect(app.querySelector(".ai-briefing-source-context")?.textContent).toContain("USGS Earthquakes");

    app.querySelector<HTMLButtonElement>(`[data-select-incident="${incidentId}"][data-selection-surface="feed"]`)?.click();

    const detailCard = getDefinedElement(app.querySelector<HTMLElement>("[data-selected-incident-id]"));
    expect(detailCard.querySelector(".source-attribution")?.textContent).toContain("USGS Earthquakes");
    expect(app.querySelector(".ai-briefing-source-context")?.textContent).toContain(
      "Selected Incident source record: us7000abcd",
    );

    getSavedEventToggle(app, incidentId, "feed").click();

    const savedEventCard = getSavedEventCard(app, incidentId);
    expect(savedEventCard.querySelector(".source-attribution")?.textContent).toContain("USGS Earthquakes");
  });

  it("renders Area Search controls, focuses the Globe Map, and preserves filters, Incident Detail, Saved Events View, and Source Status", async () => {
    const incidentId = "usgs-earthquakes:us7000abcd";
    const app = await renderDashboardApp();
    const filterInput = getDefinedElement(app.querySelector<HTMLInputElement>('[name="text"]'));

    filterInput.value = "M 5.4";
    filterInput.dispatchEvent(new Event("input", { bubbles: true }));
    app.querySelector<HTMLButtonElement>(`[data-select-incident="${incidentId}"][data-selection-surface="feed"]`)?.click();
    getSavedEventToggle(app, incidentId, "feed").click();

    const areaSearchInput = getDefinedElement(app.querySelector<HTMLInputElement>("[data-area-search-query]"));
    const areaSearchForm = getDefinedElement(app.querySelector<HTMLFormElement>("[data-area-search-form]"));
    areaSearchInput.value = "Anchorage";
    areaSearchForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(app.querySelector("[data-area-search-state]")?.getAttribute("data-area-search-state")).toBe("success");
    expect(app.querySelector(".area-search-status")?.textContent).toContain("Globe Map focused on Anchorage, Alaska");
    expect(app.querySelector(".globe-control-status")?.textContent).toContain("Center 61°, -150°");
    expect(app.querySelector(`[data-select-incident="${incidentId}"][data-area-search-nearby="true"]`)).not.toBeNull();
    expect(app.querySelector(`[data-incident-id="${incidentId}"]`)?.getAttribute("data-area-search-nearby")).toBe("true");
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
    expect(app.querySelector<HTMLInputElement>('[name="text"]')?.value).toBe("M 5.4");
    expect(getSavedEventCard(app, incidentId).textContent).toContain("USGS Earthquakes");
    expect(app.querySelector(".source-status-card")?.textContent).toContain("USGS Earthquakes");

    app.querySelector<HTMLButtonElement>("[data-clear-area-search]")?.click();

    expect(app.querySelector("[data-area-search-state]")?.getAttribute("data-area-search-state")).toBe("idle");
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
    expect(app.querySelector<HTMLInputElement>('[name="text"]')?.value).toBe("M 5.4");
  });

  it("renders Area Search ambiguous, no-result, and lookup-failure states without clearing dashboard context", async () => {
    const incidentId = "usgs-earthquakes:us7000abcd";
    const app = await renderDashboardApp();
    const filterInput = getDefinedElement(app.querySelector<HTMLInputElement>('[name="text"]'));
    const areaSearchInput = getDefinedElement(app.querySelector<HTMLInputElement>("[data-area-search-query]"));
    const areaSearchForm = getDefinedElement(app.querySelector<HTMLFormElement>("[data-area-search-form]"));

    filterInput.value = "M 5.4";
    filterInput.dispatchEvent(new Event("input", { bubbles: true }));
    app.querySelector<HTMLButtonElement>(`[data-select-incident="${incidentId}"][data-selection-surface="feed"]`)?.click();
    getSavedEventToggle(app, incidentId, "feed").click();

    areaSearchInput.value = "Alaska region";
    areaSearchForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(app.querySelector("[data-area-search-state]")?.getAttribute("data-area-search-state")).toBe("ambiguous");
    expect(app.querySelector(".area-search-status")?.textContent).toContain("possible matches");
    expect(app.querySelector(".area-search-candidates")?.textContent).toContain("Alaska, United States");
    expect(app.querySelector(".area-search-candidates")?.textContent).toContain("Gulf of Alaska");
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
    expect(app.querySelector<HTMLInputElement>('[name="text"]')?.value).toBe("M 5.4");
    expect(getSavedEventCard(app, incidentId).textContent).toContain("USGS Earthquakes");
    expect(app.querySelector(".source-status-card")?.textContent).toContain("USGS Earthquakes");

    areaSearchInput.value = "Atlantis";
    areaSearchForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(app.querySelector("[data-area-search-state]")?.getAttribute("data-area-search-state")).toBe("no-result");
    expect(app.querySelector(".area-search-status")?.textContent).toContain("No Area Search match found");
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
    expect(app.querySelector<HTMLInputElement>('[name="text"]')?.value).toBe("M 5.4");

    areaSearchInput.value = "x".repeat(121);
    areaSearchForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(app.querySelector("[data-area-search-state]")?.getAttribute("data-area-search-state")).toBe("failure");
    expect(app.querySelector(".area-search-status")?.textContent).toContain("Area Search lookup failed");
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
    expect(app.querySelector<HTMLInputElement>('[name="text"]')?.value).toBe("M 5.4");
    expect(getSavedEventCard(app, incidentId).textContent).toContain("USGS Earthquakes");
  });

  it("keeps GDACS-originated Incident source attribution visually distinct when GDACS data is present", async () => {
    const container = await renderIncidentDetailMarkup(buildGdacsFixtureIncident());

    expect(container.querySelector(".source-attribution--gdacs")?.textContent).toContain("GDACS");
    expectDetailField(container, "Public Feed", "GDACS");
    expectDetailField(container, "Source record", "GDACS source record tc-2026-001 · Retrieved Jun 10, 2026, 3:30 PM");
  });

  it("renders stale Saved Event source detail and removes it from the Saved Events View", async () => {
    const staleSavedEvent = createSavedEvent(
      {
        ...incidents[1]!,
        id: "nasa-eonet:retired-wildfire",
        title: "Retired wildfire Incident",
        rawSource: {
          ...incidents[1]!.rawSource,
          originalId: "retired-wildfire",
        },
      },
      "2026-06-10T18:00:00.000Z",
    );
    window.localStorage.setItem(SAVED_EVENTS_STORAGE_KEY, JSON.stringify([staleSavedEvent]));
    const app = await renderDashboardApp();

    const staleCard = getSavedEventCard(app, "nasa-eonet:retired-wildfire");
    expect(staleCard.dataset.state).toBe("stale");
    expect(staleCard.querySelector("h3")?.textContent).toBe("Retired wildfire Incident");
    expect(staleCard.textContent).toContain("NASA EONET");
    expect(staleCard.textContent).toContain("No longer live in the current Public Feed refresh; showing saved source details.");
    expect(staleCard.querySelector(".saved-event-stale-note")?.textContent).toBe("Live Incident unavailable");
    expect(staleCard.querySelector("[data-select-saved-event]")).toBeNull();
    expect(staleCard.querySelector(".saved-event-source-detail")?.textContent).toContain(
      "Original source id: retired-wildfire",
    );

    staleCard.querySelector<HTMLButtonElement>('[data-remove-saved-event="nasa-eonet:retired-wildfire"]')?.click();

    expect(window.localStorage.getItem(SAVED_EVENTS_STORAGE_KEY)).toBeNull();
    expect(app.querySelector('[data-saved-event-id="nasa-eonet:retired-wildfire"]')).toBeNull();
    expect(app.querySelector(".saved-events-panel .empty-state")?.textContent).toContain("No Saved Events yet.");
  });

  it("renders the compact operations shell with Settings Control as the only configuration surface", async () => {
    const app = await renderDashboardApp();
    const layout = getDefinedElement(app.querySelector<HTMLElement>('[data-dashboard-layout="compact-operations"]'));
    const settingsControl = getDefinedElement(app.querySelector<HTMLElement>("[data-settings-control]"));
    const visibilityModeControl = getDefinedElement(app.querySelector<HTMLSelectElement>("[data-visibility-mode-control]"));
    const aiBriefingChoiceControl = getDefinedElement(app.querySelector<HTMLSelectElement>("[data-ai-briefing-choice-control]"));

    expect(settingsControl.closest(".hero")).not.toBeNull();
    expect(visibilityModeControl.closest("[data-settings-control]")).toBe(settingsControl);
    expect(aiBriefingChoiceControl.closest("[data-settings-control]")).toBe(settingsControl);
    expect(app.querySelector(".dashboard-side-stack")).toBeNull();
    expect(app.querySelector(".configuration-panel")).toBeNull();
    expect(layout.querySelector(":scope > .map-panel")).not.toBeNull();
    expect(
      getDefinedElement(layout.querySelector(".map-canvas")).compareDocumentPosition(
        getDefinedElement(layout.querySelector("[data-area-search-state]")),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(layout.querySelector(":scope > .feed-panel.operations-panel")).not.toBeNull();
    const incidentAnalysisDock = getDefinedElement(layout.querySelector<HTMLElement>(":scope > .incident-analysis-dock.operations-panel"));
    expect(incidentAnalysisDock.querySelector(":scope > .detail-panel")).not.toBeNull();
    expect(incidentAnalysisDock.querySelector(":scope > .ai-briefing-panel")).not.toBeNull();
    expect(layout.querySelector(":scope > .status-panel")).not.toBeNull();
  });

  it("docks Incident Detail and AI Briefing in readable analysis panels with public-data privacy copy", async () => {
    const app = await renderDashboardApp();
    const dock = getDefinedElement(app.querySelector<HTMLElement>(".incident-analysis-dock"));
    const detailPanel = getDefinedElement(dock.querySelector<HTMLElement>(":scope > .detail-panel"));
    const aiBriefingPanel = getDefinedElement(dock.querySelector<HTMLElement>(":scope > .ai-briefing-panel"));
    const stylesheet = readFileSync("src/styles.css", "utf8");
    const dockRules = stylesheet.slice(
      stylesheet.indexOf(".incident-analysis-dock {"),
      stylesheet.indexOf(".incident-analysis-dock > .detail-panel"),
    );

    expect(detailPanel.textContent).toContain("Incident Detail");
    expect(aiBriefingPanel.textContent).toContain("AI Briefing");
    expect(aiBriefingPanel.textContent).toContain("Brief selected Incident");
    expect(aiBriefingPanel.textContent).toContain("Brief Filtered Incident Set");
    expect(aiBriefingPanel.querySelector(".ai-briefing-privacy-note")?.textContent).toContain(
      "omits usernames, direct quotes, private or auth-walled content, PII, and confidential data",
    );
    expect(dockRules).toContain("grid-template-columns: minmax(320px, 0.92fr) minmax(360px, 1.08fr)");
  });

  it("keeps every operations panel assigned at the Windows laptop breakpoint", () => {
    const stylesheet = readFileSync("src/styles.css", "utf8");
    const responsiveGridTemplate = stylesheet.match(
      /@media \(max-width: 1120px\) \{[\s\S]*?\.command-grid \{[\s\S]*?grid-template-areas:\s*([\s\S]*?);/,
    )?.[1];

    expect(responsiveGridTemplate).toBeDefined();
    expect(responsiveGridTemplate).not.toContain('"side"');
    for (const gridArea of ["map", "filters", "status", "feed", "analysis", "saved"]) {
      expect(responsiveGridTemplate).toContain(`"${gridArea}"`);
    }
  });

  it("keeps the header and summary metrics compact before the 1366px laptop first viewport", () => {
    const stylesheet = readFileSync("src/styles.css", "utf8");
    const laptopBreakpoint = stylesheet.slice(
      stylesheet.indexOf("@media (max-width: 1440px)"),
      stylesheet.indexOf("@media (max-width: 1120px)"),
    );

    expect(laptopBreakpoint).toContain(".dashboard-shell");
    expect(laptopBreakpoint).toContain("padding: 12px");
    expect(laptopBreakpoint).toContain(".settings-control small");
    expect(laptopBreakpoint).toContain(".ai-briefing-choice-prompt");
    expect(laptopBreakpoint).toContain("display: none");
    expect(laptopBreakpoint).toContain(".metric-card");
    expect(laptopBreakpoint).toContain("min-height: 0");
  });

  it("prompts for AI Briefing Choice on first visit and saves the selected AI Briefing Provider", async () => {
    const app = await renderDashboardApp();
    const choiceControl = getDefinedElement(app.querySelector<HTMLSelectElement>("[data-ai-briefing-choice-control]"));
    const choiceOptions = Array.from(choiceControl.options).map((option) => option.textContent);

    expect(choiceControl.closest("[data-settings-control]")).not.toBeNull();
    expect(choiceOptions).toEqual(["Choose an AI Briefing Provider", "OpenAI", "Anthropic", "Gemini", "Disabled"]);
    expect(choiceControl.value).toBe("");
    expect(app.querySelector("[data-ai-briefing-choice-prompt]")?.textContent).toContain("choose an AI Briefing Provider");
    expect(app.querySelector<HTMLElement>(".ai-briefing-status")?.dataset.state).toBe("disabled");
    expect(getAiBriefingRequestControl(app, "filtered-incident-set").disabled).toBe(true);
    expect(app.textContent).toContain("M 5.4 - 12 km S of Example, Alaska");

    choiceControl.value = "anthropic";
    choiceControl.dispatchEvent(new Event("change", { bubbles: true }));

    const restoredControl = getDefinedElement(app.querySelector<HTMLSelectElement>("[data-ai-briefing-choice-control]"));
    expect(window.localStorage.getItem(AI_BRIEFING_CHOICE_STORAGE_KEY)).toBe("anthropic");
    expect(restoredControl.value).toBe("anthropic");
    expect(app.querySelector("[data-ai-briefing-choice-prompt]")).toBeNull();
    expect(app.querySelector(".settings-control")?.textContent).toContain("AI Briefing Choice: Anthropic");
    expect(app.querySelector(".ai-briefing-choice-note")?.textContent).toContain("AI Briefing Choice is Anthropic.");
    expect(getAiBriefingRequestControl(app, "filtered-incident-set").disabled).toBe(false);
  });

  it("restores Disabled AI Briefing Choice and keeps the dashboard usable", async () => {
    window.localStorage.setItem(AI_BRIEFING_CHOICE_STORAGE_KEY, "disabled");
    const app = await renderDashboardApp();

    expect(app.querySelector<HTMLSelectElement>("[data-ai-briefing-choice-control]")?.value).toBe("disabled");
    expect(app.querySelector(".settings-control")?.textContent).toContain("AI Briefing Choice: Disabled");
    expect(app.querySelector(".ai-briefing-choice-note")?.textContent).toContain("AI Briefing Choice is Disabled");
    expect(app.querySelector<HTMLElement>(".ai-briefing-status")?.dataset.state).toBe("disabled");
    expect(app.querySelector(".ai-briefing-status")?.textContent).toContain("AI Briefings are off");
    expect(getAiBriefingRequestControl(app, "single-incident").disabled).toBe(true);
    expect(getAiBriefingRequestControl(app, "filtered-incident-set").disabled).toBe(true);

    app.querySelector<HTMLButtonElement>('[data-select-incident="usgs-earthquakes:us7000abcd"][data-selection-surface="feed"]')?.click();

    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe("usgs-earthquakes:us7000abcd");
    expect(app.querySelector(".map-canvas--focused")).not.toBeNull();
    expect(window.localStorage.getItem(AI_BRIEFING_CHOICE_STORAGE_KEY)).toBe("disabled");
  });

  it("shows a missing-key AI Briefing failure without disabling dashboard interaction", async () => {
    const generateAiBriefingMock = vi.fn(async (_payload: AiBriefingRequestPayload): Promise<AiBriefingOutput> => {
      throw new AiBriefingConfigurationError(
        "OPENAI_API_KEY is not configured. Add a valid key before running an AI Briefing. The Global Crisis Dashboard remains interactive.",
      );
    });
    const app = await renderDashboardAppWithAiBriefingMock(generateAiBriefingMock);

    getAiBriefingRequestControl(app, "filtered-incident-set").click();
    await flushDashboardRefresh();

    const status = getAiBriefingStatus(app);
    expect(status.dataset.state).toBe("error");
    expect(status.textContent).toContain("AI Briefing unavailable");
    expect(status.textContent).toContain("OPENAI_API_KEY is not configured");
    expect(getAiBriefingRequestControl(app, "filtered-incident-set").disabled).toBe(false);

    app.querySelector<HTMLButtonElement>('[data-select-incident="usgs-earthquakes:us7000abcd"][data-selection-surface="feed"]')?.click();
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe("usgs-earthquakes:us7000abcd");
  });

  it("plumbs the selected AI Briefing Choice through the AI Briefing request path", async () => {
    const generateAiBriefingMock = vi.fn(async (_payload: AiBriefingRequestPayload): Promise<AiBriefingOutput> => ({
      situationSummary: "Anthropic summarized the current Filtered Incident Set.",
      impactConsiderations: "Public impacts may evolve.",
      responsePriorityRecommendation: "Review high Severity Score Incidents first.",
      uncertaintyNotes: ["Public Feed details may change."],
    }));
    const app = await renderDashboardAppWithAiBriefingMock(generateAiBriefingMock, "anthropic");

    getAiBriefingRequestControl(app, "filtered-incident-set").click();
    await flushDashboardRefresh();

    expect(generateAiBriefingMock).toHaveBeenCalledWith(expect.any(Object), { aiBriefingChoice: "anthropic" });
    expect(getAiBriefingStatus(app).textContent).toContain("Anthropic summarized the current Filtered Incident Set.");
  });

  it("shows an invalid-key AI Briefing failure for a selected Incident while sending public payload data", async () => {
    const generateAiBriefingMock = vi.fn(async (payload: AiBriefingRequestPayload): Promise<AiBriefingOutput> => {
      expect(payload.scope.kind).toBe("selected_incident");
      throw new AiBriefingConfigurationError(
        "OPENAI_API_KEY was rejected by OpenAI. Check that the key is valid and has access to the configured model. The Global Crisis Dashboard remains interactive.",
      );
    });
    const app = await renderDashboardAppWithAiBriefingMock(generateAiBriefingMock);

    app.querySelector<HTMLButtonElement>('[data-select-incident="usgs-earthquakes:us7000abcd"][data-selection-surface="feed"]')?.click();
    getAiBriefingRequestControl(app, "single-incident").click();
    await flushDashboardRefresh();

    const status = getAiBriefingStatus(app);
    expect(status.dataset.state).toBe("error");
    expect(status.textContent).toContain("OPENAI_API_KEY was rejected");
    const capturedRequestPayload = expectDefined(generateAiBriefingMock.mock.calls[0]?.[0]);
    expect(capturedRequestPayload.scope).toEqual(
      expect.objectContaining({
        kind: "selected_incident",
        label: "selected Incident",
        incident: expect.objectContaining({
          id: "usgs-earthquakes:us7000abcd",
          sourceName: "USGS Earthquakes",
          sourceRecord: expect.objectContaining({
            publicFeedName: "USGS Earthquakes",
            originalId: "us7000abcd",
          }),
        }),
      }),
    );
    expect(JSON.stringify(capturedRequestPayload)).not.toContain("rawSource");
    expect(JSON.stringify(capturedRequestPayload)).not.toContain('"payload"');
  });

  it("keeps selection and saved-state controls usable after a generic AI Briefing failure", async () => {
    const generateAiBriefingMock = vi.fn(async (payload: AiBriefingRequestPayload): Promise<AiBriefingOutput> => {
      expect(payload.scope.kind).toBe("filtered_incident_set");
      throw new Error("The briefing service timed out.");
    });
    const app = await renderDashboardAppWithAiBriefingMock(generateAiBriefingMock);

    getAiBriefingRequestControl(app, "filtered-incident-set").click();
    await flushDashboardRefresh();

    const status = getAiBriefingStatus(app);
    expect(status.dataset.state).toBe("error");
    expect(status.textContent).toContain("The briefing service timed out. The Global Crisis Dashboard remains interactive.");
    const capturedRequestPayload = expectDefined(generateAiBriefingMock.mock.calls[0]?.[0]);
    expect(capturedRequestPayload.scope).toEqual(
      expect.objectContaining({
        kind: "filtered_incident_set",
        label: "Filtered Incident Set",
        incidentCount: 2,
        filters: {},
        incidents: expect.arrayContaining([
          expect.objectContaining({ id: "usgs-earthquakes:us7000abcd", sourceRecord: expect.any(Object) }),
          expect.objectContaining({ id: "usgs-earthquakes:us7000minor", sourceRecord: expect.any(Object) }),
        ]),
      }),
    );

    app.querySelector<HTMLButtonElement>('[data-select-incident="usgs-earthquakes:us7000minor"][data-selection-surface="feed"]')?.click();
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe("usgs-earthquakes:us7000minor");

    getSavedEventToggle(app, "usgs-earthquakes:us7000minor", "detail").click();
    expect(JSON.parse(window.localStorage.getItem(SAVED_EVENTS_STORAGE_KEY) ?? "[]")).toEqual([
      expect.objectContaining({ id: "usgs-earthquakes:us7000minor" }),
    ]);
  });

  it("spreads overlapping map markers so each Incident remains selectable from the map", () => {
    const overlappingIncident: Incident = {
      ...incidents[1]!,
      id: "nasa-eonet:overlap",
      title: "Wildfire activity near the earthquake coordinates",
      coordinates: incidents[0]!.coordinates,
    };
    const viewModel = buildGlobalCrisisDashboardViewModel(
      createCollection({
        incidents: [incidents[0]!, overlappingIncident],
      }),
    );
    const firstMarker = viewModel.mapMarkers.find((marker) => marker.id === "usgs-earthquakes:alpha");
    const secondMarker = viewModel.mapMarkers.find((marker) => marker.id === "nasa-eonet:overlap");

    expect(firstMarker).toEqual(expect.objectContaining({ id: "usgs-earthquakes:alpha" }));
    expect(secondMarker).toEqual(expect.objectContaining({ id: "nasa-eonet:overlap" }));
    expect(`${firstMarker?.leftPercent},${firstMarker?.topPercent}`).not.toBe(
      `${secondMarker?.leftPercent},${secondMarker?.topPercent}`,
    );
    expect(findSelectedDashboardMapMarker(viewModel.mapMarkers, "nasa-eonet:overlap")).toEqual(
      expect.objectContaining({ id: "nasa-eonet:overlap" }),
    );
  });

  it("keeps Incident Markers small and unlabeled while retaining category, Severity Score, source, and selected-state cues", async () => {
    const stylesheet = readFileSync("src/styles.css", "utf8");
    const baseMarkerRule = stylesheet.match(/\.map-marker\s*\{(?<rule>[\s\S]*?)\n\}/)?.groups?.rule ?? "";
    const majorMarkerRule = stylesheet.match(/\.map-marker--severity-major\s*\{(?<rule>[\s\S]*?)\n\}/)?.groups?.rule ?? "";
    const strongMarkerRule = stylesheet.match(/\.map-marker--severity-strong\s*\{(?<rule>[\s\S]*?)\n\}/)?.groups?.rule ?? "";
    const app = await renderDashboardApp();
    const incidentId = "usgs-earthquakes:us7000abcd";

    app.querySelector<HTMLButtonElement>(`[data-select-incident="${incidentId}"][data-selection-surface="feed"]`)?.click();

    const selectedMarker = getDefinedElement(app.querySelector<HTMLElement>(".map-marker--selected"));
    expect(baseMarkerRule).toContain("width: 9px;");
    expect(baseMarkerRule).toContain("height: 9px;");
    expect(majorMarkerRule).toContain("width: 12px;");
    expect(majorMarkerRule).toContain("height: 12px;");
    expect(strongMarkerRule).toContain("width: 10px;");
    expect(strongMarkerRule).toContain("height: 10px;");
    expect(selectedMarker.getAttribute("data-select-incident")).toBe(incidentId);
    expect(selectedMarker.classList.contains("map-marker--earthquake")).toBe(true);
    expect(selectedMarker.classList.contains("map-marker--severity-strong")).toBe(true);
    expect(selectedMarker.dataset.source).toBe("usgs-earthquakes");
    expect(selectedMarker.querySelector(".map-marker-source-abbr")).toBeNull();
    expect(selectedMarker.textContent?.trim()).toBe("M 5.4 - 12 km S of Example, Alaska from USGS Earthquakes");
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
  });

  it("keeps dense Incident Marker clusters selectable without stacked click targets", () => {
    const clusteredIncidents = Array.from({ length: 420 }, (_, index): Incident => {
      const source = index % 2 === 0 ? "usgs-earthquakes" : "nasa-eonet";
      return {
        ...incidents[index % incidents.length]!,
        id: `${source}:cluster-${index}`,
        title: `Clustered Incident ${index}`,
        source,
        sourceName: source === "usgs-earthquakes" ? "USGS Earthquakes" : "NASA EONET",
        category: index % 3 === 0 ? "earthquake" : index % 3 === 1 ? "wildfire" : "flood",
        coordinates: {
          latitude: 34.2 + (index % 6) * 0.01,
          longitude: -118.4 + (index % 7) * 0.01,
        },
        severityLabel: index % 2 === 0 ? "strong" : "major",
        severityScore: index % 2 === 0 ? 54 : 82,
      };
    });
    const viewModel = buildGlobalCrisisDashboardViewModel(createCollection({ incidents: clusteredIncidents }));
    const visibleMarkers = viewModel.mapMarkers.filter((marker) => marker.isVisible);
    const hiddenMarkers = viewModel.mapMarkers.filter((marker) => !marker.isVisible);

    expect(viewModel.mapMarkers).toHaveLength(clusteredIncidents.length);
    expect(visibleMarkers).toHaveLength(clusteredIncidents.length);
    expect(hiddenMarkers).toHaveLength(0);
    for (const [index, marker] of visibleMarkers.entries()) {
      expect(marker.topPercent <= 24 && marker.leftPercent <= 72).toBe(false);
      expect(marker.topPercent <= 27 && marker.leftPercent >= 52).toBe(false);
      expect(marker.topPercent >= 86 && marker.leftPercent >= 28 && marker.leftPercent <= 72).toBe(false);

      for (const placedMarker of visibleMarkers.slice(0, index)) {
        const leftGap = Math.abs(marker.leftPercent - placedMarker.leftPercent);
        const topGap = Math.abs(marker.topPercent - placedMarker.topPercent);
        expect(leftGap >= 1.75 || topGap >= 1.75).toBe(true);
      }
    }
  });

  it("clears selected map focus when the selected Incident has no coordinates", () => {
    const incidentWithoutCoordinates: Incident = {
      ...incidents[0]!,
      id: "nasa-eonet:charlie",
      source: "nasa-eonet",
      sourceName: "NASA EONET",
      category: "drought",
      coordinates: null,
      severityScore: 35,
      severityLabel: "moderate",
    };
    const viewModel = buildGlobalCrisisDashboardViewModel(
      createCollection({
        incidents: [incidentWithoutCoordinates],
      }),
    );
    const selectedIncidentId = resolveSelectedIncidentId(viewModel.filteredIncidentSet, "nasa-eonet:charlie");

    expect(selectedIncidentId).toBe("nasa-eonet:charlie");
    expect(viewModel.mapMarkers).toEqual([]);
    expect(findSelectedDashboardMapMarker(viewModel.mapMarkers, selectedIncidentId)).toBeNull();
  });
});
