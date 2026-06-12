// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildIncidentDetailMetricFields,
  buildGlobalCrisisDashboardViewModel,
  createIdleAreaSearchResolution,
  findSelectedDashboardMapMarker,
  focusGlobeViewOnDashboardMapMarker,
  focusGlobeViewOnAreaSearchArea,
  formatCategoryLabel,
  formatDashboardTimestamp,
  normalizeDashboardGlobeView,
  resolveDashboardMapMarkerIncidentIds,
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
  GDACS_RSS_PROXY_ENDPOINT,
  NOAA_NWS_ALERTS_PROXY_ENDPOINT,
  normalizeNasaEonetIncident,
  normalizeUsgsEarthquakeIncident,
  type CombinedIncidentCollection,
  type Incident,
  type NasaEonetIncidentPayload,
  type NoaaNwsAlertsFeedPayload,
  type SourceStatus,
  type UsgsEarthquakeFeedPayload,
} from "../src/lib/incidents";
import { SAVED_EVENTS_STORAGE_KEY, createSavedEvent } from "../src/lib/saved-events";
import { VISIBILITY_MODE_STORAGE_KEY } from "../src/lib/visibility-mode";

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
  vi.doUnmock("../src/lib/incidents");
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

function buildClusteredDrillDownIncidents(count = 12): Incident[] {
  return Array.from({ length: count }, (_, index): Incident => {
    const source = index % 2 === 0 ? "usgs-earthquakes" : "nasa-eonet";
    return {
      ...incidents[index % incidents.length]!,
      id: `${source}:ui-drill-down-${index}`,
      title: `UI drill-down Incident ${index}`,
      source,
      sourceName: source === "usgs-earthquakes" ? "USGS Earthquakes" : "NASA EONET",
      category: index % 3 === 0 ? "earthquake" : index % 3 === 1 ? "wildfire" : "flood",
      coordinates: {
        latitude: 34.2 + (index % 3) * 0.01,
        longitude: -118.4 + (index % 4) * 0.01,
      },
      severityLabel: index % 2 === 0 ? "strong" : "major",
      severityScore: index % 2 === 0 ? 54 : 82,
    };
  });
}

function buildRepeatedDrillDownIncidents(): Incident[] {
  const localizedCoordinates = [
    { latitude: 34, longitude: -118 },
    { latitude: 34.05, longitude: -117.95 },
    { latitude: 34.1, longitude: -117.9 },
    { latitude: 36.8, longitude: -115.2 },
    { latitude: 36.85, longitude: -115.15 },
    { latitude: 36.9, longitude: -115.1 },
    { latitude: 36.95, longitude: -115.05 },
  ];

  return localizedCoordinates.map((coordinates, index): Incident => {
    const source = index % 2 === 0 ? "usgs-earthquakes" : "nasa-eonet";
    return {
      ...incidents[index % incidents.length]!,
      id: `${source}:repeated-drill-down-${index}`,
      title: `Repeated drill-down Incident ${index}`,
      source,
      sourceName: source === "usgs-earthquakes" ? "USGS Earthquakes" : "NASA EONET",
      category: index % 3 === 0 ? "earthquake" : index % 3 === 1 ? "wildfire" : "flood",
      coordinates,
      severityLabel: index % 2 === 0 ? "strong" : "major",
      severityScore: index % 2 === 0 ? 54 : 82,
    };
  });
}

function readMapMarkerIncidentIds(marker: HTMLElement): string[] {
  return marker.dataset.mapMarkerIncidentIds?.split(" ").filter(Boolean) ?? [];
}

function dispatchPointerMouseEvent(
  target: EventTarget,
  type: string,
  init: MouseEventInit & { pointerId?: number; timeStamp?: number } = {},
): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, "pointerId", { configurable: true, value: init.pointerId ?? 1 });
  if (init.timeStamp !== undefined) {
    Object.defineProperty(event, "timeStamp", { configurable: true, value: init.timeStamp });
  }
  target.dispatchEvent(event);
  return event;
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
      if (endpoint.includes("noaa-nws")) {
        return { ok: true, status: 200, json: async () => ({ features: [] }) };
      }
      return {
        ok: true,
        json: async () => (endpoint.includes("eonet") ? nasaPayload : usgsPayload),
      };
    }),
  );
}

function stubPublicFeedFetchWithUnsafeSelectedIncident(): void {
  const usgsPayload = JSON.parse(
    readFileSync("tests/fixtures/usgs-earthquakes.json", "utf8"),
  ) as UsgsEarthquakeFeedPayload;
  const unsafeUsgsPayload = JSON.parse(JSON.stringify(usgsPayload)) as UsgsEarthquakeFeedPayload;
  const firstFeature = unsafeUsgsPayload.features?.[0];
  if (firstFeature?.properties == null) {
    throw new Error("USGS Earthquakes fixture is missing its first feature properties.");
  }
  firstFeature.properties.title = 'M 5.4 - Example resident said "my address is 10 Main Street"';
  const nasaPayload = { title: "EONET Events", events: [] };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const endpoint = String(input);
      if (endpoint.includes("gdacs")) {
        throw new Error("Failed to fetch");
      }
      if (endpoint.includes("noaa-nws")) {
        return { ok: true, status: 200, json: async () => ({ features: [] }) };
      }
      return {
        ok: true,
        json: async () => (endpoint.includes("eonet") ? nasaPayload : unsafeUsgsPayload),
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
      if (endpoint.includes("noaa-nws")) {
        return { ok: true, status: 200, json: async () => ({ features: [] }) };
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
  const noaaNwsPayload: NoaaNwsAlertsFeedPayload = {
    features: [
      {
        id: "https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.dashboard",
        geometry: { type: "Point", coordinates: [-97.52, 35.49] },
        properties: {
          id: "urn:oid:2.49.0.1.840.0.dashboard",
          areaDesc: "Oklahoma County",
          event: "Severe Thunderstorm Warning",
          headline: "Severe Thunderstorm Warning for Oklahoma County",
          category: "Met",
          severity: "Severe",
          certainty: "Observed",
          urgency: "Immediate",
          sent: "2026-06-10T14:00:00-05:00",
          effective: "2026-06-10T14:00:00-05:00",
          onset: "2026-06-10T14:05:00-05:00",
          expires: "2026-06-10T14:45:00-05:00",
          web: "https://alerts.weather.gov/cap/wwacapget.php?x=OK-dashboard",
        },
      },
    ],
  };

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
      if (endpoint.includes("noaa-nws")) {
        return { ok: true, status: 200, json: async () => noaaNwsPayload };
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

async function renderDashboardAppWithRestoredFeedsAndAiBriefingMock(
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
  stubPublicFeedFetchWithRestoredFeedSuccess();

  await import("../src/main");
  await flushDashboardRefresh();

  const app = document.querySelector<HTMLElement>("#app");
  if (app === null) {
    throw new Error("Dashboard app root was not rendered.");
  }
  return app;
}

async function renderDashboardAppWithUnsafeSelectedIncidentAiBriefingMock(
  generateAiBriefingMock: typeof generateAiBriefing,
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
  window.localStorage.setItem(AI_BRIEFING_CHOICE_STORAGE_KEY, "openai");
  stubPublicFeedFetchWithUnsafeSelectedIncident();

  await import("../src/main");
  await flushDashboardRefresh();

  const app = document.querySelector<HTMLElement>("#app");
  if (app === null) {
    throw new Error("Dashboard app root was not rendered.");
  }
  return app;
}

async function renderDashboardAppWithIncidentCollections(collections: CombinedIncidentCollection[]): Promise<HTMLElement> {
  vi.resetModules();
  vi.doMock("../src/lib/incidents", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../src/lib/incidents")>();
    let nextCollectionIndex = 0;

    return {
      ...actual,
      fetchCombinedIncidentCollection: vi.fn(async () => {
        const collection = collections[Math.min(nextCollectionIndex, collections.length - 1)];
        nextCollectionIndex += 1;
        return collection;
      }),
    };
  });
  document.body.innerHTML = '<div id="app"></div>';

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

function openSettingsControl(app: HTMLElement): HTMLElement {
  const toggle = getDefinedElement(app.querySelector<HTMLButtonElement>("[data-settings-control-toggle]"));
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  toggle.click();
  const settingsControl = getDefinedElement(app.querySelector<HTMLElement>("[data-settings-control]"));
  expect(settingsControl.dataset.settingsControlOpen).toBe("true");
  expect(getDefinedElement(app.querySelector<HTMLButtonElement>("[data-settings-control-toggle]")).getAttribute("aria-expanded")).toBe(
    "true",
  );
  return settingsControl;
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

  it("renders restored Public Feed success Source Status messaging for USGS, NASA EONET, GDACS, and NOAA/NWS", async () => {
    const app = await renderDashboardAppWithRestoredFeedSuccess();
    const sourceStatusCards = Array.from(app.querySelectorAll<HTMLElement>(".source-status-card"));
    const cardsByPublicFeed = new Map(
      sourceStatusCards.map((card) => [card.querySelector("strong")?.textContent ?? "", card]),
    );
    const publicFeedsOnlineMetric = Array.from(app.querySelectorAll<HTMLElement>(".metric-card")).find((card) =>
      card.textContent?.includes("Public Feeds Online"),
    );
    const gdacsRequest = vi.mocked(fetch).mock.calls.find(([input]) => String(input) === GDACS_RSS_PROXY_ENDPOINT);
    const noaaNwsRequest = vi.mocked(fetch).mock.calls.find(([input]) => String(input) === NOAA_NWS_ALERTS_PROXY_ENDPOINT);

    expect(app.querySelector(".hero-status")?.textContent).toContain("Operational");
    expect(publicFeedsOnlineMetric?.textContent).toContain("4/4");
    expect(app.textContent).toContain("M 5.4 - 12 km S of Example, Alaska");
    expect(app.textContent).toContain("Flooding in Queensland, Australia");
    expect(app.textContent).toContain("Orange tropical cyclone alert for Example Islands");
    expect(app.textContent).toContain("Severe Thunderstorm Warning for Oklahoma County");
    expect(
      app.querySelector('[data-incident-id="noaa-nws-alerts:urn:oid:2.49.0.1.840.0.dashboard"]'),
    ).not.toBeNull();
    expect(
      app.querySelector('[data-select-incident="noaa-nws-alerts:urn:oid:2.49.0.1.840.0.dashboard"][data-selection-surface="map"]'),
    ).not.toBeNull();
    expect(gdacsRequest?.[1]).toEqual(expect.objectContaining({ headers: { Accept: "*/*" } }));
    expect(noaaNwsRequest?.[1]).toEqual(
      expect.objectContaining({ headers: { Accept: "application/geo+json, application/json" } }),
    );
    expect(cardsByPublicFeed.get("GDACS")?.textContent).not.toContain(GDACS_BROWSER_RUNTIME_LIMITATION_MESSAGE);
    expect(cardsByPublicFeed.get("USGS Earthquakes")?.dataset.state).toBe("success");
    expect(cardsByPublicFeed.get("NASA EONET")?.dataset.state).toBe("success");
    expect(cardsByPublicFeed.get("GDACS")?.dataset.state).toBe("success");
    expect(cardsByPublicFeed.get("NOAA/NWS Active Alerts")?.dataset.state).toBe("success");
    for (const publicFeedName of ["USGS Earthquakes", "NASA EONET", "GDACS", "NOAA/NWS Active Alerts"]) {
      const card = cardsByPublicFeed.get(publicFeedName);
      expect(card?.textContent).toContain("Success");
      expect(card?.textContent).toContain("Public Feed refreshed successfully.");
      expect(card?.textContent).toContain("Latest successful refresh:");
    }
  });

  it("formats labels and timestamps for dashboard display", () => {
    expect(formatCategoryLabel("sea_lake_ice")).toBe("Sea or lake ice");
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

  it("normalizes Globe Map focus helpers for aggregate drill-down at the interaction bounds", () => {
    const clusteredIncidents = buildClusteredDrillDownIncidents();
    const boundaryView = normalizeDashboardGlobeView({
      rotationLongitude: -721,
      rotationLatitude: -120,
      zoom: 1.69,
    });
    const viewModel = buildGlobalCrisisDashboardViewModel(createCollection({ incidents: clusteredIncidents }));
    const aggregateMarker = expectDefined(viewModel.mapMarkers.find((marker) => marker.incidentCount > 1));
    const focusedView = focusGlobeViewOnDashboardMapMarker(aggregateMarker, boundaryView);

    expect(boundaryView).toEqual({
      rotationLongitude: -1,
      rotationLatitude: -68,
      zoom: 1.69,
    });
    expect(focusedView.rotationLongitude).toBeCloseTo(aggregateMarker.longitude, 5);
    expect(focusedView.rotationLatitude).toBe(aggregateMarker.latitude);
    expect(focusedView.zoom).toBe(1.72);
    expect(focusedView.rotationLongitude).toBeGreaterThanOrEqual(-180);
    expect(focusedView.rotationLongitude).toBeLessThanOrEqual(180);
    expect(focusedView.rotationLatitude).toBeGreaterThanOrEqual(-68);
    expect(focusedView.rotationLatitude).toBeLessThanOrEqual(68);
  });

  it("renders open Earth geography on a spherical Globe Map and updates it through spin and zoom controls", async () => {
    const app = await renderDashboardApp();
    const geography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    const landPath = getDefinedElement(geography.querySelector<SVGPathElement>(".map-geography__feature--land"));
    const stylesheet = readFileSync("src/styles.css", "utf8");
    const initialPathData = landPath.getAttribute("d");

    expect(geography.dataset.openGeography).toContain("Natural Earth");
    expect(geography.getAttribute("role")).toBe("img");
    expect(geography.querySelector(".map-geography__ocean")).not.toBeNull();
    expect(geography.querySelector(".map-geography__ocean-context")).not.toBeNull();
    expect(geography.querySelector(".map-geography__ocean-depth--inner")).not.toBeNull();
    expect(geography.querySelectorAll(".map-geography__graticule").length).toBeGreaterThan(4);
    expect(geography.querySelector(".map-geography__graticule--equator")).not.toBeNull();
    expect(geography.querySelector(".map-geography__land-relief-layer")).not.toBeNull();
    expect(geography.querySelector(".map-geography__coastline-layer")).not.toBeNull();
    expect(geography.querySelector(".map-geography__terminator")).not.toBeNull();
    expect(geography.querySelector(".map-geography__atmosphere")).not.toBeNull();
    expect(app.querySelector(".map-landmass")).toBeNull();
    expect(geography.querySelectorAll(".map-geography__feature--land").length).toBeGreaterThan(2);
    expect(geography.querySelectorAll(".map-geography__feature--land-coastline").length).toBeGreaterThan(2);
    expect(geography.querySelectorAll(".map-geography__feature--boundary").length).toBeGreaterThan(0);
    expect(app.querySelector(".map-viewport")?.classList.contains("map-geography")).toBe(false);
    expect(stylesheet).toContain(".map-geography__feature--land-coastline");
    expect(stylesheet).toContain(".map-geography__feature--boundary");
    expect(stylesheet).toContain(".map-geography__graticule--equator");
    expect(stylesheet).toContain("fill: url(#globe-land-gradient)");
    expect(stylesheet).toContain(".map-geography__atmosphere");
    expect(stylesheet).toContain("0 0 0 1px rgba(2, 6, 23, 0.62)");

    app.querySelector<HTMLButtonElement>('[data-globe-control="spin-east"]')?.click();
    app.querySelector<HTMLButtonElement>('[data-globe-control="zoom-in"]')?.click();

    const updatedGeography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    const updatedLandPath = getDefinedElement(updatedGeography.querySelector<SVGPathElement>(".map-geography__feature--land"));
    expect(app.querySelector(".globe-control-status")?.textContent).toContain("Center 18°, -81° · 116% zoom");
    expect(updatedGeography.dataset.globeCenterLongitude).toBe("-81.00");
    expect(updatedGeography.dataset.globeZoom).toBe("1.16");
    expect(updatedLandPath.getAttribute("d")).not.toBe(initialPathData);
  });

  it("lets cursor drag spin the Globe Map without clearing selected Incident or Area Search context", async () => {
    const incidentId = "usgs-earthquakes:us7000abcd";
    const app = await renderDashboardApp();
    const filterInput = getDefinedElement(app.querySelector<HTMLInputElement>('[name="text"]'));

    filterInput.value = "M 5.4";
    filterInput.dispatchEvent(new Event("input", { bubbles: true }));
    app.querySelector<HTMLButtonElement>(`[data-select-incident="${incidentId}"][data-selection-surface="feed"]`)?.click();

    const areaSearchInput = getDefinedElement(app.querySelector<HTMLInputElement>("[data-area-search-query]"));
    const areaSearchForm = getDefinedElement(app.querySelector<HTMLFormElement>("[data-area-search-form]"));
    areaSearchInput.value = "Anchorage";
    areaSearchForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    const focusedGeography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    const focusedLongitude = focusedGeography.dataset.globeCenterLongitude;
    const focusedLatitude = focusedGeography.dataset.globeCenterLatitude;
    const dragSurface = getDefinedElement(app.querySelector<HTMLElement>("[data-globe-drag-surface]"));

    dragSurface.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 120, clientY: 140 }));
    document.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 200, clientY: 170 }));
    document.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 200, clientY: 170 }));

    const draggedGeography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    const draggedZoom = Number(draggedGeography.dataset.globeZoom);
    app.querySelector<HTMLButtonElement>('[data-globe-control="zoom-in"]')?.click();
    const zoomedGeography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));

    expect(app.querySelector(".map-canvas")?.getAttribute("data-globe-interaction")).toBe("drag-spin-zoom-focus");
    expect(draggedGeography.dataset.globeCenterLongitude).not.toBe(focusedLongitude);
    expect(draggedGeography.dataset.globeCenterLatitude).not.toBe(focusedLatitude);
    expect(Number(zoomedGeography.dataset.globeZoom)).toBeGreaterThan(draggedZoom);
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
    expect(app.querySelector<HTMLInputElement>('[name="text"]')?.value).toBe("M 5.4");
    expect(app.querySelector("[data-area-search-state]")?.getAttribute("data-area-search-state")).toBe("success");
    expect(app.querySelector(".map-marker--selected")?.getAttribute("data-select-incident")).toBe(incidentId);
  });

  it("cancels drag inertia before selected-Incident focus to avoid camera fighting", async () => {
    const incidentId = "usgs-earthquakes:us7000abcd";
    const animationCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      animationCallbacks.push(callback);
      return animationCallbacks.length;
    });
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
    const app = await renderDashboardApp();
    const dragSurface = getDefinedElement(app.querySelector<HTMLElement>("[data-globe-drag-surface]"));

    dispatchPointerMouseEvent(dragSurface, "pointerdown", { button: 0, clientX: 120, clientY: 140, pointerId: 11, timeStamp: 0 });
    dispatchPointerMouseEvent(document, "pointermove", { clientX: 220, clientY: 160, pointerId: 11, timeStamp: 16 });
    dispatchPointerMouseEvent(document, "pointerup", { clientX: 220, clientY: 160, pointerId: 11, timeStamp: 32 });

    expect(requestAnimationFrame).toHaveBeenCalled();

    app.querySelector<HTMLButtonElement>(`[data-select-incident="${incidentId}"][data-selection-surface="feed"]`)?.click();

    const focusedGeography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    const focusedLatitude = focusedGeography.dataset.globeCenterLatitude;
    const focusedLongitude = focusedGeography.dataset.globeCenterLongitude;
    const focusedZoom = focusedGeography.dataset.globeZoom;
    const queuedInertiaFrame = animationCallbacks.at(-1);
    if (queuedInertiaFrame === undefined) {
      throw new Error("Expected a queued inertia frame.");
    }

    queuedInertiaFrame(48);

    const afterCancelledFrame = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(afterCancelledFrame.dataset.globeCenterLatitude).toBe(focusedLatitude);
    expect(afterCancelledFrame.dataset.globeCenterLongitude).toBe(focusedLongitude);
    expect(afterCancelledFrame.dataset.globeZoom).toBe(focusedZoom);
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
    expect(app.querySelector(".map-marker--selected")?.getAttribute("data-select-incident")).toBe(incidentId);
  });

  it("continues drag inertia through animation frames while preserving selected Incident state", async () => {
    const incidentId = "usgs-earthquakes:us7000abcd";
    const animationCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      animationCallbacks.push(callback);
      return animationCallbacks.length;
    });
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const app = await renderDashboardApp();

    app.querySelector<HTMLButtonElement>(`[data-select-incident="${incidentId}"][data-selection-surface="feed"]`)?.click();
    const dragSurface = getDefinedElement(app.querySelector<HTMLElement>("[data-globe-drag-surface]"));
    dispatchPointerMouseEvent(dragSurface, "pointerdown", { button: 0, clientX: 220, clientY: 160, pointerId: 12, timeStamp: 0 });
    dispatchPointerMouseEvent(document, "pointermove", { clientX: 120, clientY: 110, pointerId: 12, timeStamp: 16 });
    dispatchPointerMouseEvent(document, "pointerup", { clientX: 120, clientY: 110, pointerId: 12, timeStamp: 32 });

    const afterDragGeography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    const afterDragLatitude = afterDragGeography.dataset.globeCenterLatitude;
    const afterDragLongitude = afterDragGeography.dataset.globeCenterLongitude;
    const queuedInertiaFrame = animationCallbacks.at(-1);
    if (queuedInertiaFrame === undefined) {
      throw new Error("Expected a queued inertia frame.");
    }

    queuedInertiaFrame(48);

    const afterInertiaGeography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    expect(requestAnimationFrame).toHaveBeenCalledTimes(3);
    expect(afterInertiaGeography.dataset.globeCenterLatitude).not.toBe(afterDragLatitude);
    expect(afterInertiaGeography.dataset.globeCenterLongitude).not.toBe(afterDragLongitude);
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
    expect(app.querySelector(".map-marker--selected")?.getAttribute("data-select-incident")).toBe(incidentId);
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

    const initialGeography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    const initialZoom = Number(initialGeography.dataset.globeZoom);

    marker.click();

    const focusedGeography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    const detailCard = getDefinedElement(app.querySelector<HTMLElement>("[data-selected-incident-id]"));
    const selectedMarker = getDefinedElement(app.querySelector<HTMLButtonElement>(".map-marker--selected"));
    expect(detailCard.getAttribute("data-selected-incident-id")).toBe(incidentId);
    expect(detailCard.textContent).toContain("M 5.4 - 12 km S of Example, Alaska");
    expect(detailCard.textContent).toContain("USGS Earthquakes");
    expect(selectedMarker.getAttribute("data-select-incident")).toBe(incidentId);
    expect(selectedMarker.getAttribute("data-selection-surface")).toBe("map");
    expect(selectedMarker.getAttribute("aria-pressed")).toBe("true");
    expect(Number(focusedGeography.dataset.globeCenterLatitude)).toBe(61.2);
    expect(Number(focusedGeography.dataset.globeCenterLongitude)).toBe(-149.9);
    expect(Number(focusedGeography.dataset.globeZoom)).toBeGreaterThan(initialZoom);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "nearest" });
    expect(app.querySelector(".map-canvas--focused")?.textContent).toContain(
      "Globe Map focused on M 5.4 - 12 km S of Example, Alaska.",
    );
  });

  it("zooms promptly to a feed-selected Incident while preserving the current filters", async () => {
    const incidentId = "usgs-earthquakes:us7000abcd";
    const app = await renderDashboardApp();
    const filterInput = getDefinedElement(app.querySelector<HTMLInputElement>('[name="text"]'));
    const initialGeography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    const initialZoom = Number(initialGeography.dataset.globeZoom);

    filterInput.value = "M 5.4";
    filterInput.dispatchEvent(new Event("input", { bubbles: true }));
    app.querySelector<HTMLButtonElement>(`[data-select-incident="${incidentId}"][data-selection-surface="feed"]`)?.click();

    const focusedGeography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    expect(Number(focusedGeography.dataset.globeCenterLatitude)).toBe(61.2);
    expect(Number(focusedGeography.dataset.globeCenterLongitude)).toBe(-149.9);
    expect(Number(focusedGeography.dataset.globeZoom)).toBeGreaterThan(initialZoom);
    expect(app.querySelector<HTMLInputElement>('[name="text"]')?.value).toBe("M 5.4");
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
    expect(app.querySelector(".map-marker--selected")?.getAttribute("data-select-incident")).toBe(incidentId);
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

    const normalizedAreaFocus = focusGlobeViewOnAreaSearchArea(
      {
        id: "custom-area",
        label: "Custom area",
        center: { latitude: 88, longitude: 540 },
        radiusKm: 120,
        matchedTerms: ["custom"],
      },
      { rotationLatitude: 0, rotationLongitude: 0, zoom: 1 },
    );
    expect(normalizedAreaFocus).toEqual({
      rotationLatitude: 68,
      rotationLongitude: 180,
      zoom: 1.58,
    });
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
        label: "USGS earthquake magnitude",
        value: "5.4 magnitude",
        sourceName: "USGS Earthquakes",
      },
    ]);
    expect(buildIncidentDetailMetricFields(incidents[1]!)).toEqual([]);
    expect(
      buildIncidentDetailMetricFields({
        ...incidents[0]!,
        source: "gdacs",
        sourceName: "GDACS",
        rawSource: {
          publicFeed: "gdacs",
          publicFeedName: "GDACS",
          originalId: "gdacs-1",
          retrievedAt: refreshedAt,
          payload: { alertLevel: "RED" },
        },
      }),
    ).toEqual([{ label: "GDACS alert level", value: "Red", sourceName: "GDACS" }]);
    expect(
      buildIncidentDetailMetricFields({
        ...incidents[0]!,
        source: "noaa-nws-alerts",
        sourceName: "NOAA/NWS Active Alerts",
        rawSource: {
          publicFeed: "noaa-nws-alerts",
          publicFeedName: "NOAA/NWS Active Alerts",
          originalId: "nws-1",
          retrievedAt: refreshedAt,
          payload: { properties: { severity: "Severe", urgency: "Expected", certainty: "Likely" } },
        },
      }),
    ).toEqual([
      { label: "NOAA/NWS source severity", value: "Severe", sourceName: "NOAA/NWS Active Alerts" },
      { label: "NOAA/NWS urgency", value: "Expected", sourceName: "NOAA/NWS Active Alerts" },
      { label: "NOAA/NWS certainty", value: "Likely", sourceName: "NOAA/NWS Active Alerts" },
    ]);
  });

  it("suppresses invented source measurements when a Public Feed did not publish supported measurement fields", async () => {
    const nasaIncidentWithUnsupportedPayload: Incident = {
      ...buildNasaEonetFixtureIncident(),
      severityScore: 65,
      severityLabel: "strong",
      rawSource: {
        publicFeed: "nasa-eonet",
        publicFeedName: "NASA EONET",
        originalId: "EONET_7777",
        retrievedAt: refreshedAt,
        payload: { magnitude: 9.9, alertLevel: "RED", severity: "EXTREME" },
      },
    };
    const gdacsIncidentWithoutAlertLevel: Incident = {
      ...buildGdacsFixtureIncident(),
      rawSource: {
        publicFeed: "gdacs",
        publicFeedName: "GDACS",
        originalId: "tc-2026-001",
        retrievedAt: refreshedAt,
        payload: { magnitude: 4.2, windSpeed: "120 kt" },
      },
    };

    expect(buildIncidentDetailMetricFields(nasaIncidentWithUnsupportedPayload)).toEqual([]);
    expect(buildIncidentDetailMetricFields(gdacsIncidentWithoutAlertLevel)).toEqual([]);

    const container = await renderIncidentDetailMarkup(nasaIncidentWithUnsupportedPayload);
    expectDetailField(
      container,
      "App Severity Score",
      "App Severity Score 65/100 (Strong normalized dashboard ranking; not a source-reported measurement)",
    );
    expect(container.querySelector(".incident-detail-metrics .fallback-text")?.textContent).toBe(
      "No source-reported measurements were published by NASA EONET for this Incident.",
    );
    expect(container.textContent).not.toContain("9.9");
    expect(container.textContent).not.toContain("EXTREME");
  });

  it("renders Incident Detail visible fields for full-data USGS Earthquakes Incidents", async () => {
    const incident = loadUsgsFixtureIncident();
    const container = await renderIncidentDetailMarkup(incident);

    expect(container.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incident.id);
    expect(container.querySelector("h3")?.textContent).toBe("M 5.4 - 12 km S of Example, Alaska");
    expectDetailField(container, "Public Feed", "USGS Earthquakes");
    expectDetailField(container, "Category", "Earthquake");
    expectDetailField(
      container,
      "App Severity Score",
      "App Severity Score 54/100 (Strong normalized dashboard ranking; not a source-reported measurement)",
    );
    expectDetailField(container, "Location", "61.2000, -149.9000");
    expectDetailField(container, "Source record", "USGS Earthquakes source record us7000abcd · Retrieved Jun 10, 2026, 3:30 PM");
    expect(container.querySelector('a[href="https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd"]')?.textContent).toBe(
      "Open source attribution",
    );
    expectDetailField(container, "USGS earthquake magnitude", "5.4 magnitude from USGS Earthquakes");
    expect(container.querySelector(".incident-detail-section--facts")?.textContent).toContain("App Severity Score");
    expect(container.querySelector(".incident-detail-section--source")?.textContent).toContain("Open source attribution");
    expect(container.querySelector(".incident-detail-section--source")?.textContent).toContain("Source record");
    expect(container.querySelector(".incident-detail-metrics")?.textContent).toContain("USGS earthquake magnitude");
    expect(container.querySelector(".incident-detail-metrics .fallback-text")).toBeNull();
  });

  it("renders Incident Detail fallback text for partial NASA EONET Incidents", async () => {
    const incident = buildNasaEonetFixtureIncident();
    const container = await renderIncidentDetailMarkup(incident);

    expect(container.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe("nasa-eonet:EONET_7777");
    expect(container.querySelector("h3")?.textContent).toBe("Wildfire activity in British Columbia, Canada");
    expectDetailField(container, "Public Feed", "NASA EONET");
    expectDetailField(container, "Category", "Wildfire");
    expectDetailField(
      container,
      "App Severity Score",
      "App Severity Score 65/100 (Strong normalized dashboard ranking; not a source-reported measurement)",
    );
    expectDetailField(container, "Location", "53.7000, -123.1000");
    expectDetailField(container, "Updated", "Not yet available");
    expectDetailField(container, "Source link", "Source link unavailable from NASA EONET.");
    expectDetailField(container, "Source record", "NASA EONET source record EONET_7777 · Retrieved Jun 10, 2026, 3:30 PM");
    expect(container.querySelector(".incident-detail-metrics .fallback-text")?.textContent).toBe(
      "No source-reported measurements were published by NASA EONET for this Incident.",
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
    expectDetailField(
      container,
      "App Severity Score",
      "App Severity Score unavailable (normalized dashboard ranking, not a source-reported measurement)",
    );
    expectDetailField(container, "Location", "Location unavailable");
    expectDetailField(container, "Updated", "Not yet available");
    expectDetailField(container, "Source link", "Source link unavailable from USGS Earthquakes.");
    expectDetailField(container, "Source record", "USGS Earthquakes source record ID unavailable · Retrieved Not yet available");
    expect(container.querySelector(".incident-detail-metrics .fallback-text")?.textContent).toBe(
      "No source-reported measurements were published by USGS Earthquakes for this Incident.",
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
    expect(feedCard.querySelector(".incident-card-measurements")?.textContent).toContain("Source-reported measurements");
    expectDetailField(feedCard, "USGS earthquake magnitude", "5.4 magnitude from USGS Earthquakes");
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

    expect(settingsControl.closest(".hero")).not.toBeNull();
    expect(settingsControl.dataset.settingsControlOpen).toBe("false");
    expect(getDefinedElement(settingsControl.querySelector<HTMLButtonElement>("[data-settings-control-toggle]")).textContent).toContain(
      "Settings Control",
    );
    expect(app.querySelector("[data-visibility-mode-control]")).toBeNull();
    expect(app.querySelector("[data-ai-briefing-choice-control]")).toBeNull();

    const openedSettingsControl = openSettingsControl(app);
    const visibilityModeControl = getDefinedElement(app.querySelector<HTMLSelectElement>("[data-visibility-mode-control]"));
    const aiBriefingChoiceControl = getDefinedElement(app.querySelector<HTMLSelectElement>("[data-ai-briefing-choice-control]"));
    expect(visibilityModeControl.closest("[data-settings-control]")).toBe(openedSettingsControl);
    expect(aiBriefingChoiceControl.closest("[data-settings-control]")).toBe(openedSettingsControl);
    expect(openedSettingsControl.textContent).toContain("OPENAI_API_KEY");
    expect(openedSettingsControl.textContent).toContain("ANTHROPIC_API_KEY");
    expect(openedSettingsControl.textContent).toContain("GEMINI_API_KEY");
    expect(openedSettingsControl.textContent).toContain("can be changed later");
    expect(app.querySelector(".dashboard-side-stack")).toBeNull();
    expect(app.querySelector(".configuration-panel")).toBeNull();
    expect(layout.querySelector(":scope > .map-panel")).not.toBeNull();
    expect(app.querySelector(".metrics-panel .panel-heading")?.textContent).toContain("Summary metrics");
    expect(app.querySelector(".metrics-panel #summary-metrics-title")?.textContent).toBe("Operational overview");
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
    for (const heading of [
      "Primary geographic Incident view",
      "Live public Incidents",
      "Incident Detail",
      "AI Briefing",
      "Public Feed freshness",
      "Operational overview",
      "Saved Events View",
    ]) {
      expect(app.textContent).toContain(heading);
    }
  });

  it("restores both Settings Control choices after a dashboard reload without duplicate entry points", async () => {
    const app = await renderDashboardApp();
    openSettingsControl(app);
    const visibilityModeControl = getDefinedElement(app.querySelector<HTMLSelectElement>("[data-visibility-mode-control]"));
    const aiBriefingChoiceControl = getDefinedElement(app.querySelector<HTMLSelectElement>("[data-ai-briefing-choice-control]"));

    visibilityModeControl.value = "high-contrast";
    visibilityModeControl.dispatchEvent(new Event("change", { bubbles: true }));
    aiBriefingChoiceControl.value = "gemini";
    aiBriefingChoiceControl.dispatchEvent(new Event("change", { bubbles: true }));

    expect(window.localStorage.getItem(VISIBILITY_MODE_STORAGE_KEY)).toBe("high-contrast");
    expect(window.localStorage.getItem(AI_BRIEFING_CHOICE_STORAGE_KEY)).toBe("gemini");

    const reloadedApp = await renderDashboardApp();
    expect(reloadedApp.querySelector("[data-visibility-mode-control]")).toBeNull();
    expect(reloadedApp.querySelector("[data-ai-briefing-choice-control]")).toBeNull();
    const settingsControl = openSettingsControl(reloadedApp);
    const restoredVisibilityModeControl = getDefinedElement(
      reloadedApp.querySelector<HTMLSelectElement>("[data-visibility-mode-control]"),
    );
    const restoredAiBriefingChoiceControl = getDefinedElement(
      reloadedApp.querySelector<HTMLSelectElement>("[data-ai-briefing-choice-control]"),
    );

    expect(reloadedApp.querySelectorAll("[data-settings-control]")).toHaveLength(1);
    expect(reloadedApp.querySelectorAll("[data-visibility-mode-control]")).toHaveLength(1);
    expect(reloadedApp.querySelectorAll("[data-ai-briefing-choice-control]")).toHaveLength(1);
    expect(settingsControl.closest(".hero")).not.toBeNull();
    expect(restoredVisibilityModeControl.closest("[data-settings-control]")).toBe(settingsControl);
    expect(restoredAiBriefingChoiceControl.closest("[data-settings-control]")).toBe(settingsControl);
    expect(restoredVisibilityModeControl.value).toBe("high-contrast");
    expect(restoredAiBriefingChoiceControl.value).toBe("gemini");
    expect(settingsControl.dataset.currentVisibilityMode).toBe("high-contrast");
    expect(settingsControl.dataset.currentAiBriefingChoice).toBe("gemini");
    expect(document.documentElement.dataset.visibilityMode).toBe("high-contrast");
    expect(settingsControl.textContent).toContain("Current Visibility Mode: High contrast");
    expect(settingsControl.textContent).toContain("AI Briefing Choice: Gemini");
    expect(reloadedApp.querySelector(".filters-panel [data-visibility-mode-control]")).toBeNull();
    expect(reloadedApp.querySelector(".filters-panel [data-ai-briefing-choice-control]")).toBeNull();
    expect(reloadedApp.querySelector(".metrics-grid [data-visibility-mode-control]")).toBeNull();
    expect(reloadedApp.querySelector(".metrics-grid [data-ai-briefing-choice-control]")).toBeNull();
  });

  it("removes configuration controls from the dashboard again when the Settings Control closes", async () => {
    const app = await renderDashboardApp();
    const settingsControl = openSettingsControl(app);
    const visibilityModeControl = getDefinedElement(app.querySelector<HTMLSelectElement>("[data-visibility-mode-control]"));
    const aiBriefingChoiceControl = getDefinedElement(app.querySelector<HTMLSelectElement>("[data-ai-briefing-choice-control]"));

    visibilityModeControl.value = "dark";
    visibilityModeControl.dispatchEvent(new Event("change", { bubbles: true }));
    aiBriefingChoiceControl.value = "disabled";
    aiBriefingChoiceControl.dispatchEvent(new Event("change", { bubbles: true }));
    getDefinedElement(app.querySelector<HTMLButtonElement>("[data-settings-control-toggle]")).click();

    const closedSettingsControl = getDefinedElement(app.querySelector<HTMLElement>("[data-settings-control]"));
    expect(closedSettingsControl.dataset.settingsControlOpen).toBe("false");
    expect(closedSettingsControl.dataset.currentVisibilityMode).toBe("dark");
    expect(closedSettingsControl.dataset.currentAiBriefingChoice).toBe("disabled");
    expect(closedSettingsControl.textContent).toContain("Current Visibility Mode: Dark");
    expect(closedSettingsControl.textContent).toContain("AI Briefing Choice: Disabled");
    expect(app.querySelector("[data-visibility-mode-control]")).toBeNull();
    expect(app.querySelector("[data-ai-briefing-choice-control]")).toBeNull();
    expect(app.querySelector("[data-ai-briefing-key-guidance]")).toBeNull();
    expect(app.textContent).not.toContain("OPENAI_API_KEY");
    expect(app.querySelector(".filters-panel [data-settings-control]")).toBeNull();
    expect(app.querySelector(".incident-analysis-dock [data-settings-control]")).toBeNull();
    expect(settingsControl).not.toBe(closedSettingsControl);
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
    expect(aiBriefingPanel.querySelector(".ai-briefing-request-panel")?.textContent).toContain("Choose briefing scope");
    expect(aiBriefingPanel.querySelector(".ai-briefing-provider-panel")?.textContent).toContain("Selected AI Briefing Provider");
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

  it("uses sharp compact dashboard styling while keeping the Globe Map as the dominant surface", () => {
    const stylesheet = readFileSync("src/styles.css", "utf8");
    const commandGridStart = stylesheet.indexOf(".command-grid {");
    const commandGridRules = stylesheet.slice(
      commandGridStart,
      stylesheet.indexOf(".map-panel,", commandGridStart),
    );
    const mapCanvasRules = stylesheet.slice(stylesheet.indexOf(".map-canvas {"), stylesheet.indexOf(".map-viewport {"));
    const mapViewportRules = stylesheet.slice(
      stylesheet.indexOf(".map-viewport {"),
      stylesheet.indexOf(".map-canvas--focused"),
    );
    const panelRules = stylesheet.slice(stylesheet.indexOf(".map-panel,"), stylesheet.indexOf(".map-panel {"));

    expect(commandGridRules).toContain(
      "grid-template-columns: minmax(380px, 1.18fr) minmax(380px, 1.18fr) minmax(280px, 0.64fr)",
    );
    expect(commandGridRules).toContain('"map map filters"');
    expect(commandGridRules).toContain('"map map status"');
    expect(mapCanvasRules).toContain("--globe-viewport-max: 820px");
    expect(mapCanvasRules).toContain("min-height: calc(var(--globe-viewport-max) + var(--globe-viewport-gutter))");
    expect(mapViewportRules).toContain("width: min(84%, var(--globe-viewport-max))");
    expect(mapViewportRules).toContain("max-width: calc(100% - var(--globe-viewport-gutter))");
    expect(panelRules).toContain("border-radius: 4px");
  });

  it("prompts for AI Briefing Choice on first visit and saves the selected AI Briefing Provider", async () => {
    const app = await renderDashboardApp();
    openSettingsControl(app);
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
    openSettingsControl(app);

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

  it("renders selected-Incident Public Social Context alongside every AI Briefing section", async () => {
    const generateAiBriefingMock = vi.fn(async (payload: AiBriefingRequestPayload): Promise<AiBriefingOutput> => {
      expect(payload.scope.kind).toBe("selected_incident");
      expect(payload.publicSocialContext).toEqual(
        expect.objectContaining({
          locality: "12 km S of Example, Alaska",
          signals: expect.arrayContaining([
            expect.objectContaining({
              topic: "Earthquake public context scope",
              sourceType: "public_social",
            }),
            expect.objectContaining({
              topic: "Source separation",
              sourceType: "public_official",
            }),
          ]),
        }),
      );
      return {
        situationSummary: "OpenAI summarized the selected Incident from public source facts.",
        impactConsiderations: "Public impacts may evolve near the affected area.",
        responsePriorityRecommendation: "Review the selected Incident while checking source updates.",
        uncertaintyNotes: ["Public Feed details and broader public signals can change."],
      };
    });
    const app = await renderDashboardAppWithAiBriefingMock(generateAiBriefingMock);

    app.querySelector<HTMLButtonElement>('[data-select-incident="usgs-earthquakes:us7000abcd"][data-selection-surface="feed"]')?.click();
    getAiBriefingRequestControl(app, "single-incident").click();
    await flushDashboardRefresh();

    const status = getAiBriefingStatus(app);
    expect(status.dataset.state).toBe("ready");
    expect(status.textContent).toContain("Situation summary");
    expect(status.textContent).toContain("Likely impact considerations");
    expect(status.textContent).toContain("Public Social Context");
    expect(status.textContent).toContain("Localized public signal summaries aggregated from public sources");
    expect(status.textContent).toContain("12 km S of Example, Alaska");
    expect(status.textContent).toContain("Earthquake public context scope");
    expect(status.textContent).toContain("Source separation");
    expect(status.textContent).toContain("Response Priority Recommendation");
    expect(status.textContent).toContain("Uncertainty Note");
    expect(status.querySelector(".ai-briefing-block--public-social-context")?.textContent).toContain("Localized public signal summaries");
    expect(status.querySelector(".ai-briefing-block--response-priority")?.textContent).toContain("Review the selected Incident");
    expect(status.querySelector(".ai-briefing-block--uncertainty-note")?.textContent).toContain("Public Feed details");
  });

  it("keeps selected-Incident AI Briefings synchronized when Incident selection changes", async () => {
    const generateAiBriefingMock = vi.fn(async (payload: AiBriefingRequestPayload): Promise<AiBriefingOutput> => {
      if (payload.scope.kind !== "selected_incident") {
        throw new Error("Expected a selected Incident AI Briefing request.");
      }

      return {
        situationSummary: `Summary for ${payload.scope.incident.id}.`,
        impactConsiderations: "Public impacts may evolve.",
        responsePriorityRecommendation: "Review source-attributed updates.",
        uncertaintyNotes: ["Public Feed details may change."],
      };
    });
    const app = await renderDashboardAppWithAiBriefingMock(generateAiBriefingMock);

    app.querySelector<HTMLButtonElement>('[data-select-incident="usgs-earthquakes:us7000abcd"][data-selection-surface="feed"]')?.click();
    getAiBriefingRequestControl(app, "single-incident").click();
    await flushDashboardRefresh();

    expect(getAiBriefingStatus(app).textContent).toContain("Summary for usgs-earthquakes:us7000abcd.");

    app.querySelector<HTMLButtonElement>('[data-select-incident="usgs-earthquakes:us7000minor"][data-selection-surface="feed"]')?.click();

    expect(getAiBriefingStatus(app).textContent).not.toContain("Summary for usgs-earthquakes:us7000abcd.");
    expect(getAiBriefingStatus(app).textContent).toContain("Choose a selected Incident");

    getAiBriefingRequestControl(app, "single-incident").click();
    await flushDashboardRefresh();

    expect(generateAiBriefingMock).toHaveBeenCalledTimes(2);
    expect(getAiBriefingStatus(app).textContent).toContain("Summary for usgs-earthquakes:us7000minor.");
  });

  it("clears a selected-Incident AI Briefing when filters remove the selected Incident", async () => {
    const generateAiBriefingMock = vi.fn(async (payload: AiBriefingRequestPayload): Promise<AiBriefingOutput> => {
      if (payload.scope.kind !== "selected_incident") {
        throw new Error("Expected a selected Incident AI Briefing request.");
      }

      return {
        situationSummary: `Summary for ${payload.scope.incident.id}.`,
        impactConsiderations: "Public impacts may evolve.",
        responsePriorityRecommendation: "Review source-attributed updates.",
        uncertaintyNotes: ["Public Feed details may change."],
      };
    });
    const app = await renderDashboardAppWithAiBriefingMock(generateAiBriefingMock);

    app.querySelector<HTMLButtonElement>('[data-select-incident="usgs-earthquakes:us7000abcd"][data-selection-surface="feed"]')?.click();
    getAiBriefingRequestControl(app, "single-incident").click();
    await flushDashboardRefresh();

    expect(getAiBriefingStatus(app).textContent).toContain("Summary for usgs-earthquakes:us7000abcd.");

    const textFilter = getDefinedElement(app.querySelector<HTMLInputElement>('form[data-filters] input[name="text"]'));
    textFilter.value = "No matching selected Incident";
    textFilter.dispatchEvent(new Event("input", { bubbles: true }));

    const status = getAiBriefingStatus(app);
    expect(app.querySelector("[data-selected-incident-id]")).toBeNull();
    expect(status.dataset.state).toBe("idle");
    expect(status.textContent).not.toContain("Summary for usgs-earthquakes:us7000abcd.");
    expect(status.textContent).toContain("Choose a selected Incident");
  });

  it("explains when a successful selected-Incident AI Briefing omits unsafe Public Social Context", async () => {
    const generateAiBriefingMock = vi.fn(async (payload: AiBriefingRequestPayload): Promise<AiBriefingOutput> => {
      expect(payload.scope.kind).toBe("selected_incident");
      return {
        situationSummary: "OpenAI summarized the selected Incident from public-feed facts.",
        impactConsiderations: "Public impacts may evolve.",
        responsePriorityRecommendation: "Review the selected Incident while monitoring source updates.",
        uncertaintyNotes: ["Public Social Context was unavailable for this selected Incident."],
      };
    });
    const app = await renderDashboardAppWithUnsafeSelectedIncidentAiBriefingMock(generateAiBriefingMock);

    app.querySelector<HTMLButtonElement>('[data-select-incident="usgs-earthquakes:us7000abcd"][data-selection-surface="feed"]')?.click();
    getAiBriefingRequestControl(app, "single-incident").click();
    await flushDashboardRefresh();

    const status = getAiBriefingStatus(app);
    const capturedRequestPayload = expectDefined(generateAiBriefingMock.mock.calls[0]?.[0]);
    expect(capturedRequestPayload).not.toHaveProperty("publicSocialContext");
    expect(status.dataset.state).toBe("ready");
    expect(status.textContent).toContain("OpenAI summarized the selected Incident from public-feed facts.");
    expect(status.textContent).toContain("Public Social Context unavailable");
    expect(status.textContent).toContain("used only core Public Feed facts");
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(
      "usgs-earthquakes:us7000abcd",
    );
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
    expect(capturedRequestPayload.publicSocialContext).toEqual(
      expect.objectContaining({
        locality: "12 km S of Example, Alaska",
        signals: expect.arrayContaining([
          expect.objectContaining({
            topic: "Earthquake public context scope",
            sourceType: "public_social",
          }),
          expect.objectContaining({
            topic: "Source separation",
            sourceType: "public_official",
          }),
        ]),
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
    expect(capturedRequestPayload).not.toHaveProperty("publicSocialContext");
    expect(status.textContent).toContain("Public Social Context was not produced for this request");

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
    expect(baseMarkerRule).toContain("width: 5px;");
    expect(baseMarkerRule).toContain("height: 5px;");
    expect(majorMarkerRule).toContain("width: 7px;");
    expect(majorMarkerRule).toContain("height: 7px;");
    expect(strongMarkerRule).toContain("width: 6px;");
    expect(strongMarkerRule).toContain("height: 6px;");
    expect(selectedMarker.getAttribute("data-select-incident")).toBe(incidentId);
    expect(selectedMarker.classList.contains("map-marker--earthquake")).toBe(true);
    expect(selectedMarker.classList.contains("map-marker--severity-strong")).toBe(true);
    expect(selectedMarker.dataset.source).toBe("usgs-earthquakes");
    expect(selectedMarker.querySelector(".map-marker-source-abbr")).toBeNull();
    expect(selectedMarker.textContent?.trim()).toBe(
      "Earthquake Incident from USGS Earthquakes: M 5.4 - 12 km S of Example, Alaska; source-reported measurements: USGS earthquake magnitude: 5.4 magnitude from USGS Earthquakes; app score 54/100 (Strong normalized ranking)",
    );
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
  });

  it("uses compact selected-state styling consistently across Globe Map, Incident Feed, and Incident Detail", async () => {
    const stylesheet = readFileSync("src/styles.css", "utf8");
    const selectedMarkerRule = stylesheet.match(/\.map-marker--selected\s*\{(?<rule>[\s\S]*?)\n\}/)?.groups?.rule ?? "";
    const selectedFeedRule = stylesheet.match(/\.incident-card--selected\s*\{(?<rule>[\s\S]*?)\n\}/)?.groups?.rule ?? "";
    const selectedDetailRule =
      stylesheet.match(/\.incident-detail-card\[data-selected-incident-id\]\s*\{(?<rule>[\s\S]*?)\n\}/)?.groups?.rule ??
      "";
    const app = await renderDashboardApp();
    const incidentId = "usgs-earthquakes:us7000abcd";

    app.querySelector<HTMLButtonElement>(`[data-select-incident="${incidentId}"][data-selection-surface="feed"]`)?.click();

    expect(stylesheet).toContain("--dashboard-selected-accent");
    expect(stylesheet).toContain("--dashboard-selected-border");
    expect(stylesheet).toContain("--dashboard-selected-wash");
    expect(stylesheet).toContain(".map-marker--selected");
    expect(stylesheet).toContain(".incident-card--selected");
    expect(stylesheet).toContain(".incident-detail-card[data-selected-incident-id]");
    expect(stylesheet).not.toContain(".map-marker-label");
    expect(stylesheet).not.toContain("persistent globe label");
    expect(selectedMarkerRule).toContain("scale(1.12)");
    expect(selectedMarkerRule).not.toContain("0 0 7px");
    expect(selectedFeedRule).toContain("inset 0 0 0 1px");
    expect(selectedFeedRule).not.toContain("0 10px");
    expect(selectedDetailRule).toContain("var(--dashboard-selected-wash)");
    expect(selectedDetailRule).not.toContain("drop-shadow");
    expect(getDefinedElement(app.querySelector<HTMLElement>(".map-marker--selected")).dataset.selectIncident).toBe(incidentId);
    expect(
      getDefinedElement(app.querySelector<HTMLElement>(`[data-incident-id="${incidentId}"]`)).classList.contains(
        "incident-card--selected",
      ),
    ).toBe(true);
    expect(getDefinedElement(app.querySelector<HTMLElement>("[data-selected-incident-id]")).dataset.selectedIncidentId).toBe(
      incidentId,
    );
  });

  it("uses Other Incident as a complete marker category phrase without duplicated wording", async () => {
    const otherIncident: Incident = {
      ...incidents[1]!,
      id: "nasa-eonet:other-label",
      title: "Unclassified environmental update near Example",
      category: "other",
      source: "nasa-eonet",
      sourceName: "NASA EONET",
      coordinates: { latitude: 38.9, longitude: -77.0 },
      severityScore: null,
      severityLabel: null,
      rawSource: {
        publicFeed: "nasa-eonet",
        publicFeedName: "NASA EONET",
        originalId: "other-label",
        retrievedAt: refreshedAt,
        payload: {},
      },
    };
    const app = await renderDashboardAppWithIncidentCollections([createCollection({ incidents: [otherIncident] })]);
    const marker = getDefinedElement(
      app.querySelector<HTMLButtonElement>('[data-select-incident="nasa-eonet:other-label"][data-selection-surface="map"]'),
    );
    const expectedLabel =
      "Other Incident from NASA EONET: Unclassified environmental update near Example; no source-reported measurements published by NASA EONET; app score unavailable";

    expect(marker.textContent?.trim()).toBe(expectedLabel);
    expect(marker.getAttribute("title")).toBe(expectedLabel);
    expect(marker.getAttribute("aria-label")).toBe(`Select ${expectedLabel}`);
    expect(marker.textContent).not.toContain("Other Incident Incident");
  });

  it("aggregates dense Incident Marker clusters into compact selectable counts without stacked click targets", () => {
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
    const aggregateMarkers = visibleMarkers.filter((marker) => marker.incidentCount > 1);
    const selectedClusterMember = "nasa-eonet:cluster-1";
    const selectedAggregate = expectDefined(findSelectedDashboardMapMarker(viewModel.mapMarkers, selectedClusterMember) ?? undefined);
    const stylesheet = readFileSync("src/styles.css", "utf8");

    expect(viewModel.mapMarkers.length).toBeLessThan(clusteredIncidents.length / 4);
    expect(aggregateMarkers.length).toBeGreaterThan(0);
    expect(aggregateMarkers.reduce((count, marker) => count + marker.incidentCount, 0)).toBe(clusteredIncidents.length);
    expect(aggregateMarkers[0]).toEqual(
      expect.objectContaining({
        incidentCount: expect.any(Number),
        title: expect.stringContaining("nearby Incidents"),
      }),
    );
    expect(selectedAggregate.incidentIds).toContain(selectedClusterMember);
    expect(hiddenMarkers).toHaveLength(0);
    expect(stylesheet).toContain(".map-marker {");
    expect(stylesheet).toContain("width: 5px;");
    expect(stylesheet).toContain("height: 5px;");
    expect(stylesheet).toContain("min-width: 13px;");
    expect(stylesheet).toContain("height: 13px;");
    expect(stylesheet).toContain("font-size: 0.54rem;");
    for (const [index, marker] of visibleMarkers.entries()) {
      expect(marker.topPercent <= 24 && marker.leftPercent <= 72).toBe(false);
      expect(marker.topPercent <= 27 && marker.leftPercent >= 52).toBe(false);
      expect(marker.topPercent >= 86 && marker.leftPercent >= 28 && marker.leftPercent <= 72).toBe(false);

      for (const placedMarker of visibleMarkers.slice(0, index)) {
        const leftGap = Math.abs(marker.leftPercent - placedMarker.leftPercent);
        const topGap = Math.abs(marker.topPercent - placedMarker.topPercent);
        expect(leftGap >= 1.3 || topGap >= 1.3).toBe(true);
      }
    }
  });

  it("keeps an aggregate Globe Map selected marker aligned with the selected feed Incident", async () => {
    const clusteredIncidents = Array.from({ length: 42 }, (_, index): Incident => {
      const source = index % 2 === 0 ? "usgs-earthquakes" : "nasa-eonet";
      return {
        ...incidents[index % incidents.length]!,
        id: `${source}:selected-aggregate-${index}`,
        title: `Selected aggregate Incident ${index}`,
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
    const selectedIncidentId = "nasa-eonet:selected-aggregate-1";
    const viewModel = buildGlobalCrisisDashboardViewModel(createCollection({ incidents: clusteredIncidents }));

    expect(findSelectedDashboardMapMarker(viewModel.mapMarkers, selectedIncidentId)).toEqual(
      expect.objectContaining({
        incidentCount: expect.any(Number),
        incidentIds: expect.arrayContaining([selectedIncidentId]),
      }),
    );

    const app = await renderDashboardAppWithIncidentCollections([createCollection({ incidents: clusteredIncidents })]);
    app.querySelector<HTMLButtonElement>(`[data-select-incident="${selectedIncidentId}"][data-selection-surface="feed"]`)?.click();

    const selectedMarker = getDefinedElement(app.querySelector<HTMLElement>(".map-marker--selected"));
    expect(selectedMarker.dataset.selectIncident).toBe(selectedIncidentId);
    expect(selectedMarker.getAttribute("aria-label")).toContain("containing selected Incident Selected aggregate Incident 1");
    expect(
      getDefinedElement(app.querySelector<HTMLElement>(`[data-incident-id="${selectedIncidentId}"]`)).classList.contains(
        "incident-card--selected",
      ),
    ).toBe(true);
    expect(getDefinedElement(app.querySelector<HTMLElement>("[data-selected-incident-id]")).dataset.selectedIncidentId).toBe(
      selectedIncidentId,
    );
  });

  it("preserves a feed-selected Incident when its aggregate Incident Marker is drilled into", async () => {
    const clusteredIncidents = Array.from({ length: 42 }, (_, index): Incident => {
      const source = index % 2 === 0 ? "usgs-earthquakes" : "nasa-eonet";
      return {
        ...incidents[index % incidents.length]!,
        id: `${source}:selected-drill-down-${index}`,
        title: `Selected drill-down Incident ${index}`,
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
    const aggregateWithNonLeadSelectedIncident = expectDefined(
      viewModel.mapMarkers.find(
        (marker) => marker.incidentCount > 1 && marker.incidentIds.some((incidentId) => incidentId !== marker.id),
      ),
    );
    const selectedIncidentId = expectDefined(
      aggregateWithNonLeadSelectedIncident.incidentIds.find(
        (incidentId) => incidentId !== aggregateWithNonLeadSelectedIncident.id,
      ),
    );
    const selectedIncidentTitle = expectDefined(
      clusteredIncidents.find((incident) => incident.id === selectedIncidentId)?.title,
    );
    const app = await renderDashboardAppWithIncidentCollections([createCollection({ incidents: clusteredIncidents })]);

    app.querySelector<HTMLButtonElement>(`[data-select-incident="${selectedIncidentId}"][data-selection-surface="feed"]`)?.click();
    const selectedAggregateMarker = getDefinedElement(app.querySelector<HTMLButtonElement>(".map-marker--aggregate.map-marker--selected"));
    const aggregateIncidentIds = readMapMarkerIncidentIds(selectedAggregateMarker);

    selectedAggregateMarker.click();

    const selectedDetail = getDefinedElement(app.querySelector<HTMLElement>("[data-selected-incident-id]"));
    const selectedMapMarkers = Array.from(app.querySelectorAll<HTMLElement>(".map-marker--selected"));
    const emphasizedCards = Array.from(
      app.querySelectorAll<HTMLElement>('.incident-card[data-aggregate-drill-down-selected="true"]'),
    );
    expect(selectedIncidentId).not.toBe(aggregateWithNonLeadSelectedIncident?.id);
    expect(aggregateIncidentIds).toContain(selectedIncidentId);
    expect(selectedDetail.dataset.selectedIncidentId).toBe(selectedIncidentId);
    expect(selectedDetail.textContent).toContain(selectedIncidentTitle);
    expect(getDefinedElement(app.querySelector<HTMLElement>(`[data-incident-id="${selectedIncidentId}"]`)).classList).toContain(
      "incident-card--selected",
    );
    expect(emphasizedCards.map((card) => card.dataset.incidentId).sort()).toEqual(aggregateIncidentIds);
    expect(selectedMapMarkers).toHaveLength(1);
    expect(selectedMapMarkers[0]?.dataset.selectIncident).toBe(selectedIncidentId);
    expect(app.querySelector("[data-aggregate-drill-down-state]")?.textContent).toContain("Globe Map focused on localized Incidents");
  });

  it("resolves aggregate Incident Marker drill-down ids while preserving single Incident Markers", () => {
    const clusteredIncidents = Array.from({ length: 12 }, (_, index): Incident => {
      const source = index % 2 === 0 ? "usgs-earthquakes" : "nasa-eonet";
      return {
        ...incidents[index % incidents.length]!,
        id: `${source}:drill-down-${index}`,
        title: `Drill-down Incident ${index}`,
        source,
        sourceName: source === "usgs-earthquakes" ? "USGS Earthquakes" : "NASA EONET",
        coordinates: {
          latitude: 34.2 + (index % 3) * 0.01,
          longitude: -118.4 + (index % 4) * 0.01,
        },
      };
    });
    const viewModel = buildGlobalCrisisDashboardViewModel(createCollection({ incidents: clusteredIncidents }));
    const aggregateMarker = expectDefined(viewModel.mapMarkers.find((marker) => marker.incidentCount > 1));
    const staleIncidentId = aggregateMarker.incidentIds[0]!;
    const refreshedFilteredIncidentSet = viewModel.filteredIncidentSet.filter((incident) => incident.id !== staleIncidentId);
    const singleMarker = expectDefined(buildGlobalCrisisDashboardViewModel(createCollection()).mapMarkers[0]);

    expect(resolveDashboardMapMarkerIncidentIds(aggregateMarker, viewModel.filteredIncidentSet)).toEqual(
      aggregateMarker.incidentIds,
    );
    expect(resolveDashboardMapMarkerIncidentIds(aggregateMarker, refreshedFilteredIncidentSet)).toEqual(
      aggregateMarker.incidentIds.filter((incidentId) => incidentId !== staleIncidentId),
    );
    expect(resolveDashboardMapMarkerIncidentIds(singleMarker, [])).toEqual(singleMarker.incidentIds);
    expect(resolveDashboardMapMarkerIncidentIds(null, viewModel.filteredIncidentSet)).toEqual([]);
  });

  it("drills into an aggregated Incident Marker from the Globe Map while preserving filters and emphasizing its localized Incidents", async () => {
    const clusteredIncidents = buildClusteredDrillDownIncidents();
    const app = await renderDashboardAppWithIncidentCollections([createCollection({ incidents: clusteredIncidents })]);
    const sourceFilter = getDefinedElement(app.querySelector<HTMLSelectElement>('[name="source"]'));
    sourceFilter.value = "usgs-earthquakes";
    sourceFilter.dispatchEvent(new Event("input", { bubbles: true }));
    const aggregateMarker = getDefinedElement(app.querySelector<HTMLButtonElement>(".map-marker--aggregate"));
    const dragSurface = getDefinedElement(app.querySelector<HTMLElement>("[data-globe-drag-surface]"));
    const setPointerCapture = vi.fn();
    Object.defineProperty(dragSurface, "setPointerCapture", { configurable: true, value: setPointerCapture });
    const aggregateIncidentIds = aggregateMarker.dataset.mapMarkerIncidentIds?.split(" ") ?? [];
    const initialGeography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    const initialLatitude = Number(initialGeography.dataset.globeCenterLatitude);
    const initialLongitude = Number(initialGeography.dataset.globeCenterLongitude);
    const initialZoom = Number(initialGeography.dataset.globeZoom);

    dispatchPointerMouseEvent(aggregateMarker, "pointerdown", { button: 0, clientX: 120, clientY: 140, pointerId: 7 });
    dispatchPointerMouseEvent(document, "pointerup", { clientX: 120, clientY: 140, pointerId: 7 });
    aggregateMarker.click();

    const focusedGeography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    const emphasizedIncidentCards = Array.from(app.querySelectorAll<HTMLElement>('[data-aggregate-drill-down-selected="true"]')).filter(
      (element) => element.classList.contains("incident-card"),
    );
    const selectedIncidentId = app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id");
    const selectedMapMarkers = Array.from(app.querySelectorAll<HTMLElement>(".map-marker--selected"));
    expect(Number(focusedGeography.dataset.globeCenterLatitude)).not.toBe(initialLatitude);
    expect(Number(focusedGeography.dataset.globeCenterLongitude)).not.toBe(initialLongitude);
    expect(Number(focusedGeography.dataset.globeZoom)).toBeGreaterThan(initialZoom);
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(getDefinedElement(app.querySelector<HTMLSelectElement>('[name="source"]')).value).toBe("usgs-earthquakes");
    expect(emphasizedIncidentCards).toHaveLength(aggregateIncidentIds.length);
    expect(emphasizedIncidentCards.every((card) => aggregateIncidentIds.includes(card.dataset.incidentId ?? ""))).toBe(true);
    expect(selectedIncidentId === null || selectedIncidentId === undefined ? false : aggregateIncidentIds.includes(selectedIncidentId)).toBe(true);
    expect(selectedMapMarkers).toHaveLength(1);
    expect(selectedMapMarkers[0]?.dataset.selectIncident).toBe(selectedIncidentId);
    expect(selectedMapMarkers[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(
      Array.from(app.querySelectorAll<HTMLElement>(".map-marker--aggregate-drill-down-selected")).every(
        (marker) => marker.classList.contains("map-marker--selected") === readMapMarkerIncidentIds(marker).includes(selectedIncidentId ?? ""),
      ),
    ).toBe(true);
    expect(app.querySelector("[data-aggregate-drill-down-state]")?.textContent).toContain("Globe Map focused on localized Incidents");
    expect(app.querySelector("[data-selected-incident-id]")?.textContent).toContain("USGS Earthquakes");
  });

  it("explains when an aggregated Incident Marker drill-down no longer has underlying Incidents in the current data", async () => {
    const clusteredIncidents = buildClusteredDrillDownIncidents();
    const unrelatedIncident: Incident = {
      ...incidents[0]!,
      id: "usgs-earthquakes:unrelated-refresh",
      title: "Unrelated refreshed earthquake Incident",
      coordinates: { latitude: 12.2, longitude: -80.1 },
    };
    const app = await renderDashboardAppWithIncidentCollections([
      createCollection({ incidents: clusteredIncidents }),
      createCollection({ incidents: [unrelatedIncident] }),
    ]);

    getDefinedElement(app.querySelector<HTMLButtonElement>(".map-marker--aggregate")).click();
    getDefinedElement(app.querySelector<HTMLButtonElement>("[data-refresh]")).click();
    await flushDashboardRefresh();

    const changedMessage = getDefinedElement(app.querySelector<HTMLElement>('[data-aggregate-drill-down-state="changed"]'));
    expect(changedMessage.textContent).toContain("localized Incident set changed");
    expect(changedMessage.textContent).toContain("none of the Incidents");
    expect(app.querySelector("[data-selected-incident-id]")).toBeNull();
    expect(app.textContent).toContain("Unrelated refreshed earthquake Incident");
  });

  it("recomputes and selects a second real aggregate Incident Marker during repeated Globe Map drill-down", async () => {
    const repeatedDrillDownIncidents = buildRepeatedDrillDownIncidents();
    const collection = createCollection({ incidents: repeatedDrillDownIncidents });
    const app = await renderDashboardAppWithIncidentCollections([collection]);
    const globalGlobeView = { rotationLatitude: 18, rotationLongitude: -105, zoom: 1 };
    const initialViewModel = buildGlobalCrisisDashboardViewModel(collection, {}, globalGlobeView);
    const firstAggregateButton = getDefinedElement(app.querySelector<HTMLButtonElement>(".map-marker--aggregate"));
    const firstAggregateIncidentIds = readMapMarkerIncidentIds(firstAggregateButton);
    const firstAggregateMarker = expectDefined(
      initialViewModel.mapMarkers.find((marker) => marker.incidentIds.join(" ") === firstAggregateIncidentIds.join(" ")),
    );
    const expectedFirstGlobeView = focusGlobeViewOnDashboardMapMarker(firstAggregateMarker, globalGlobeView);

    expect(firstAggregateIncidentIds).toEqual(repeatedDrillDownIncidents.map((incident) => incident.id).sort());

    firstAggregateButton.click();

    const afterFirstGeography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    const regionalViewModel = buildGlobalCrisisDashboardViewModel(collection, {}, expectedFirstGlobeView);
    const secondAggregateButton = expectDefined(
      Array.from(app.querySelectorAll<HTMLButtonElement>(".map-marker--aggregate")).find((button) => {
        const incidentIds = readMapMarkerIncidentIds(button);
        return incidentIds.length >= 3 && incidentIds.length < firstAggregateIncidentIds.length;
      }),
    );
    const secondAggregateIncidentIds = readMapMarkerIncidentIds(secondAggregateButton);
    const secondAggregateMarker = expectDefined(
      regionalViewModel.mapMarkers.find((marker) => marker.incidentIds.join(" ") === secondAggregateIncidentIds.join(" ")),
    );
    const expectedSecondGlobeView = focusGlobeViewOnDashboardMapMarker(secondAggregateMarker, expectedFirstGlobeView);

    expect(Number(afterFirstGeography.dataset.globeCenterLatitude)).toBe(Number(expectedFirstGlobeView.rotationLatitude.toFixed(2)));
    expect(Number(afterFirstGeography.dataset.globeCenterLongitude)).toBe(Number(expectedFirstGlobeView.rotationLongitude.toFixed(2)));
    expect(Number(afterFirstGeography.dataset.globeZoom)).toBe(Number(expectedFirstGlobeView.zoom.toFixed(2)));
    expect(secondAggregateIncidentIds.every((incidentId) => firstAggregateIncidentIds.includes(incidentId))).toBe(true);
    expect(regionalViewModel.mapMarkers.filter((marker) => marker.incidentCount > 1)).toHaveLength(2);

    secondAggregateButton.click();

    const afterSecondGeography = getDefinedElement(app.querySelector<SVGSVGElement>(".map-geography"));
    const emphasizedIncidentCards = Array.from(
      app.querySelectorAll<HTMLElement>('[data-aggregate-drill-down-selected="true"]'),
    ).filter((element) => element.classList.contains("incident-card"));
    const selectedIncidentId = app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id");
    const selectedMapMarkers = Array.from(app.querySelectorAll<HTMLElement>(".map-marker--selected"));

    expect(Number(afterSecondGeography.dataset.globeCenterLatitude)).toBe(Number(expectedSecondGlobeView.rotationLatitude.toFixed(2)));
    expect(Number(afterSecondGeography.dataset.globeCenterLongitude)).toBe(Number(expectedSecondGlobeView.rotationLongitude.toFixed(2)));
    expect(Number(afterSecondGeography.dataset.globeZoom)).toBe(Number(expectedSecondGlobeView.zoom.toFixed(2)));
    expect(expectedSecondGlobeView.zoom).toBeGreaterThan(expectedFirstGlobeView.zoom);
    expect(selectedIncidentId === null || selectedIncidentId === undefined ? false : secondAggregateIncidentIds.includes(selectedIncidentId)).toBe(true);
    expect(emphasizedIncidentCards.map((card) => card.dataset.incidentId).sort()).toEqual(secondAggregateIncidentIds);
    expect(selectedMapMarkers).toHaveLength(1);
    expect(selectedMapMarkers[0]?.dataset.selectIncident).toBe(selectedIncidentId);
    expect(selectedMapMarkers[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(app.querySelector("[data-aggregate-drill-down-state]")?.textContent).toContain("Globe Map focused on localized Incidents");
  });

  it("keeps aggregate Incident Marker drill-down focused on antimeridian clusters", () => {
    const antimeridianGlobeView = { rotationLatitude: 0, rotationLongitude: 180, zoom: 1.2 };
    const antimeridianIncidents = [179.2, -179.6, 180].map((longitude, index): Incident => {
      const source = index % 2 === 0 ? "usgs-earthquakes" : "nasa-eonet";
      return {
        ...incidents[index % incidents.length]!,
        id: `${source}:antimeridian-${index}`,
        title: `Antimeridian Incident ${index}`,
        source,
        sourceName: source === "usgs-earthquakes" ? "USGS Earthquakes" : "NASA EONET",
        coordinates: {
          latitude: 0.2 + index * 0.05,
          longitude,
        },
      };
    });
    const aggregateMarker = expectDefined(
      buildGlobalCrisisDashboardViewModel(createCollection({ incidents: antimeridianIncidents }), {}, antimeridianGlobeView)
        .mapMarkers.find((marker) => marker.incidentCount > 1),
    );
    const nextGlobeView = focusGlobeViewOnDashboardMapMarker(aggregateMarker, {
      rotationLatitude: 18,
      rotationLongitude: -105,
      zoom: 1,
    });

    expect(aggregateMarker.incidentIds).toEqual(antimeridianIncidents.map((incident) => incident.id).sort());
    expect(aggregateMarker.longitude).toBeGreaterThan(179);
    expect(nextGlobeView.rotationLongitude).toBeCloseTo(aggregateMarker.longitude, 5);
    expect(nextGlobeView.zoom).toBeGreaterThan(1);
  });

  it("keeps remediation state synchronized across Settings Control, Area Search, Globe Map selection, and the AI Briefing dock", async () => {
    const generateAiBriefingMock = vi.fn(async (_payload: AiBriefingRequestPayload): Promise<AiBriefingOutput> => ({
      situationSummary: "Operations view summarized the selected Incident.",
      impactConsiderations: "Nearby response routes may need monitoring.",
      responsePriorityRecommendation: "Review the selected Incident before lower Severity Score Incidents.",
      uncertaintyNotes: ["Public Feed details can change between refreshes."],
    }));
    const app = await renderDashboardAppWithAiBriefingMock(generateAiBriefingMock, "openai");
    const settingsControl = openSettingsControl(app);
    const visibilityModeControl = getDefinedElement(app.querySelector<HTMLSelectElement>("[data-visibility-mode-control]"));
    const areaSearchInput = getDefinedElement(app.querySelector<HTMLInputElement>("[data-area-search-query]"));
    const areaSearchForm = getDefinedElement(app.querySelector<HTMLFormElement>("[data-area-search-form]"));
    const incidentId = "usgs-earthquakes:us7000abcd";

    expect(settingsControl.dataset.currentAiBriefingChoice).toBe("openai");
    expect(settingsControl.closest(".hero")).not.toBeNull();

    visibilityModeControl.value = "high-contrast";
    visibilityModeControl.dispatchEvent(new Event("change", { bubbles: true }));

    expect(window.localStorage.getItem(VISIBILITY_MODE_STORAGE_KEY)).toBe("high-contrast");
    expect(document.documentElement.dataset.visibilityMode).toBe("high-contrast");
    expect(getDefinedElement(app.querySelector<HTMLElement>("[data-settings-control]")).dataset.currentVisibilityMode).toBe(
      "high-contrast",
    );

    areaSearchInput.value = "Anchorage";
    areaSearchForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(app.querySelector("[data-area-search-state]")?.getAttribute("data-area-search-state")).toBe("success");
    expect(app.querySelector(".globe-control-status")?.textContent).toContain("Center 61°, -150°");
    expect(app.querySelector(`[data-select-incident="${incidentId}"][data-area-search-nearby="true"]`)).not.toBeNull();

    app.querySelector<HTMLButtonElement>(`[data-select-incident="${incidentId}"][data-selection-surface="map"]`)?.click();

    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
    expect(app.querySelector(".map-marker--selected")?.getAttribute("data-select-incident")).toBe(incidentId);
    expect(getAiBriefingRequestControl(app, "single-incident").disabled).toBe(false);
    expect(getDefinedElement(app.querySelector<HTMLElement>(".ai-briefing-panel")).closest(".incident-analysis-dock")).not.toBeNull();

    getAiBriefingRequestControl(app, "single-incident").click();
    await flushDashboardRefresh();

    expect(generateAiBriefingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: expect.objectContaining({
          kind: "selected_incident",
          incident: expect.objectContaining({ id: incidentId, sourceName: "USGS Earthquakes" }),
        }),
      }),
      { aiBriefingChoice: "openai" },
    );
    expect(getAiBriefingStatus(app).dataset.state).toBe("ready");
    expect(getAiBriefingStatus(app).textContent).toContain("Operations view summarized the selected Incident.");
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
  });

  it("passes a phase integration regression across launcher startup, Public Feeds, Globe Map, settings, Saved Events, and AI Briefings", async () => {
    const generateAiBriefingMock = vi.fn(async (payload: AiBriefingRequestPayload): Promise<AiBriefingOutput> => {
      expect(payload.scope).toEqual(
        expect.objectContaining({
          kind: "selected_incident",
          incident: expect.objectContaining({ id: "usgs-earthquakes:us7000abcd" }),
        }),
      );
      expect(payload.publicSocialContext).toEqual(
        expect.objectContaining({
          locality: "12 km S of Example, Alaska",
          signals: expect.arrayContaining([
            expect.objectContaining({ topic: "Earthquake public context scope" }),
            expect.objectContaining({ topic: "Source separation" }),
          ]),
        }),
      );
      expect(JSON.stringify(payload)).not.toContain("rawSource");
      expect(JSON.stringify(payload)).not.toContain('"payload"');

      return {
        situationSummary: "OpenAI integrated the selected Incident with safe Public Social Context.",
        impactConsiderations: "Operational teams should monitor nearby public disruption signals.",
        responsePriorityRecommendation: "Review the selected Incident before lower Severity Score Incidents.",
        uncertaintyNotes: ["Public Feed details and public signals can change."],
      };
    });
    const launcher = readFileSync("Start Global Crisis Dashboard.bat", "utf8").replace(/\r\n/g, "\n");
    const app = await renderDashboardAppWithRestoredFeedsAndAiBriefingMock(generateAiBriefingMock, "openai");
    const sourceStatusCards = Array.from(app.querySelectorAll<HTMLElement>(".source-status-card"));
    const publicFeedsOnlineMetric = Array.from(app.querySelectorAll<HTMLElement>(".metric-card")).find((card) =>
      card.textContent?.includes("Public Feeds Online"),
    );
    const markerRule = readFileSync("src/styles.css", "utf8").match(/\.map-marker\s*\{(?<rule>[\s\S]*?)\n\}/)?.groups
      ?.rule;
    const incidentId = "usgs-earthquakes:us7000abcd";

    expect(launcher).toContain('set "LOCAL_APP_URL=http://127.0.0.1:5173/"');
    expect(launcher).toContain('set "LAUNCH_COMMAND=npm run dev -- --open"');
    expect(launcher).toContain("call %LAUNCH_COMMAND%");
    expect(getDefinedElement(app.querySelector<HTMLElement>('[data-dashboard-layout="compact-operations"]'))).not.toBeNull();
    expect(app.querySelector(".map-canvas")?.getAttribute("data-globe-interaction")).toBe("drag-spin-zoom-focus");
    expect(app.querySelector(".map-geography")?.getAttribute("role")).toBe("img");
    expect(markerRule).toContain("width: 5px;");
    expect(markerRule).toContain("height: 5px;");
    expect(app.querySelector(".map-marker-source-abbr")).toBeNull();
    expect(publicFeedsOnlineMetric?.textContent).toContain("4/4");
    expect(sourceStatusCards).toHaveLength(4);
    expect(sourceStatusCards.every((card) => card.dataset.state === "success")).toBe(true);
    expect(app.textContent).toContain("Severe Thunderstorm Warning for Oklahoma County");
    expect(
      app.querySelector('[data-select-incident="noaa-nws-alerts:urn:oid:2.49.0.1.840.0.dashboard"][data-selection-surface="map"]'),
    ).not.toBeNull();

    openSettingsControl(app);
    getDefinedElement(app.querySelector<HTMLSelectElement>("[data-visibility-mode-control]")).value = "high-contrast";
    getDefinedElement(app.querySelector<HTMLSelectElement>("[data-visibility-mode-control]")).dispatchEvent(
      new Event("change", { bubbles: true }),
    );
    expect(window.localStorage.getItem(VISIBILITY_MODE_STORAGE_KEY)).toBe("high-contrast");
    expect(document.documentElement.dataset.visibilityMode).toBe("high-contrast");

    app.querySelector<HTMLButtonElement>(`[data-select-incident="${incidentId}"][data-selection-surface="feed"]`)?.click();
    const selectedBeforeDragLongitude = getDefinedElement(
      app.querySelector<SVGSVGElement>(".map-geography"),
    ).dataset.globeCenterLongitude;
    const dragSurface = getDefinedElement(app.querySelector<HTMLElement>("[data-globe-drag-surface]"));
    dragSurface.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 160, clientY: 160 }));
    document.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 230, clientY: 110 }));
    document.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 230, clientY: 110 }));

    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
    expect(app.querySelector(".map-marker--selected")?.getAttribute("data-select-incident")).toBe(incidentId);
    expect(app.querySelector<SVGSVGElement>(".map-geography")?.dataset.globeCenterLongitude).not.toBe(
      selectedBeforeDragLongitude,
    );

    getSavedEventToggle(app, incidentId, "detail").click();
    expect(JSON.parse(window.localStorage.getItem(SAVED_EVENTS_STORAGE_KEY) ?? "[]")).toEqual([
      expect.objectContaining({ id: incidentId }),
    ]);
    expect(getSavedEventCard(app, incidentId).textContent).toContain("USGS Earthquakes");

    getAiBriefingRequestControl(app, "single-incident").click();
    await flushDashboardRefresh();

    expect(generateAiBriefingMock).toHaveBeenCalledWith(expect.any(Object), { aiBriefingChoice: "openai" });
    expect(getAiBriefingStatus(app).dataset.state).toBe("ready");
    expect(getAiBriefingStatus(app).textContent).toContain("OpenAI integrated the selected Incident");
    expect(getAiBriefingStatus(app).textContent).toContain("Public Social Context");
    expect(app.querySelector("[data-selected-incident-id]")?.getAttribute("data-selected-incident-id")).toBe(incidentId);
    expect(getSavedEventCard(app, incidentId).dataset.state).toBe("live");
    expect(app.querySelectorAll(".source-status-card")).toHaveLength(4);
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
