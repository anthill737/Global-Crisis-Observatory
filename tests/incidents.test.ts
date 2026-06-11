import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildNasaEonetEventsEndpoint,
  fetchCombinedIncidentCollection,
  fetchGdacsIncidents,
  fetchNasaEonetIncidents,
  fetchUsgsEarthquakeFeed,
  filterIncidents,
  GDACS_BROWSER_RUNTIME_LIMITATION_MESSAGE,
  GDACS_RSS_FEED_ENDPOINT,
  normalizeIncident,
  normalizeNasaEonetIncident,
  normalizeUsgsEarthquakeIncident,
  scoreIncidentSeverity,
  type FeedAdapterFetch,
  type FeedAdapterResult,
  type Incident,
  type NasaEonetFeedPayload,
  type UsgsEarthquakeFeedPayload,
} from "../src/lib/incidents";

describe("Incident normalization", () => {
  it("creates a stable shared Incident shape with reusable Severity Score fields", () => {
    const rawPayload = { id: "raw-1" };

    const incident = normalizeIncident({
      rawId: " raw-1 ",
      title: " Flooding near river basin ",
      category: "flood",
      source: "nasa-eonet",
      sourceName: "NASA EONET",
      startedAt: "2026-06-10T12:00:00Z",
      rawPayload,
    });

    expect(incident).toMatchObject<Incident<typeof rawPayload>>({
      id: "nasa-eonet:raw-1",
      title: "Flooding near river basin",
      category: "flood",
      source: "nasa-eonet",
      sourceName: "NASA EONET",
      sourceUrl: null,
      coordinates: null,
      startedAt: "2026-06-10T12:00:00.000Z",
      updatedAt: null,
      severityScore: 60,
      severityLabel: "strong",
      rawSource: {
        publicFeed: "nasa-eonet",
        publicFeedName: "NASA EONET",
        originalId: "raw-1",
        retrievedAt: null,
        payload: rawPayload,
      },
    });
  });

  it("sanitizes optional model fields while preserving raw-source attribution", () => {
    const rawPayload = { id: "model-1", nested: { source: "fixture" } };

    const incident = normalizeIncident({
      rawId: " model-1 ",
      title: " Source-linked Incident ",
      category: "other",
      source: "usgs-earthquakes",
      sourceName: "USGS Earthquakes",
      sourceUrl: " https://example.org/incidents/model-1 ",
      coordinates: { latitude: 95, longitude: 200 },
      startedAt: new Date("2026-06-10T12:00:00Z"),
      updatedAt: "not-a-date",
      retrievedAt: "2026-06-10T12:05:00Z",
      severityScore: 100.4,
      rawPayload,
    });

    expect(incident).toMatchObject<Incident<typeof rawPayload>>({
      id: "usgs-earthquakes:model-1",
      title: "Source-linked Incident",
      category: "other",
      source: "usgs-earthquakes",
      sourceName: "USGS Earthquakes",
      sourceUrl: "https://example.org/incidents/model-1",
      coordinates: null,
      startedAt: "2026-06-10T12:00:00.000Z",
      updatedAt: null,
      severityScore: 100,
      severityLabel: "major",
      rawSource: {
        publicFeed: "usgs-earthquakes",
        publicFeedName: "USGS Earthquakes",
        originalId: "model-1",
        retrievedAt: "2026-06-10T12:05:00.000Z",
        payload: rawPayload,
      },
    });
  });

  it("rejects shared Incident inputs missing stable required fields", () => {
    const requiredFields = {
      category: "other" as const,
      source: "nasa-eonet" as const,
      sourceName: "NASA EONET",
      startedAt: "2026-06-10T12:00:00Z",
      rawPayload: { id: "required-fields" },
    };

    expect(normalizeIncident({ ...requiredFields, rawId: " ", title: "Missing raw id" })).toBeNull();
    expect(normalizeIncident({ ...requiredFields, rawId: "missing-title", title: " " })).toBeNull();
    expect(normalizeIncident({ ...requiredFields, rawId: "missing-start", title: "Missing start", startedAt: "" })).toBeNull();
  });

  it("normalizes a raw USGS earthquake payload into a source-attributed Incident", () => {
    const rawUsgs = {
      id: "us7000abcd",
      properties: {
        title: "M 5.4 - 12 km S of Example, Alaska",
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd",
        time: 1781092800000,
        updated: 1781096400000,
        mag: 5.4,
      },
      geometry: {
        type: "Point",
        coordinates: [-149.9, 61.2, 20.5],
      },
    };

    const incident = normalizeUsgsEarthquakeIncident(rawUsgs, {
      retrievedAt: "2026-06-10T13:00:00Z",
    });

    expect(incident).toMatchObject({
      id: "usgs-earthquakes:us7000abcd",
      title: "M 5.4 - 12 km S of Example, Alaska",
      category: "earthquake",
      source: "usgs-earthquakes",
      sourceName: "USGS Earthquakes",
      sourceUrl: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd",
      coordinates: { latitude: 61.2, longitude: -149.9 },
      startedAt: "2026-06-10T12:00:00.000Z",
      updatedAt: "2026-06-10T13:00:00.000Z",
      severityScore: 54,
      severityLabel: "strong",
      rawSource: {
        publicFeed: "usgs-earthquakes",
        publicFeedName: "USGS Earthquakes",
        originalId: "us7000abcd",
        retrievedAt: "2026-06-10T13:00:00.000Z",
        payload: rawUsgs,
      },
    });
  });

  it("normalizes a raw NASA EONET payload while deriving source-independent Severity Score fields", () => {
    const rawNasa = {
      id: "EONET_1234",
      title: "Wildfire activity in British Columbia, Canada",
      categories: [{ id: "wildfires", title: "Wildfires" }],
      sources: [],
      geometry: [
        {
          date: "2026-06-09T18:30:00Z",
          type: "Point",
          coordinates: [-123.1, 53.7],
        },
      ],
    };

    const incident = normalizeNasaEonetIncident(rawNasa);

    expect(incident).toMatchObject({
      id: "nasa-eonet:EONET_1234",
      title: "Wildfire activity in British Columbia, Canada",
      category: "wildfire",
      source: "nasa-eonet",
      sourceName: "NASA EONET",
      sourceUrl: null,
      coordinates: { latitude: 53.7, longitude: -123.1 },
      startedAt: "2026-06-09T18:30:00.000Z",
      updatedAt: null,
      severityScore: 65,
      severityLabel: "strong",
      rawSource: {
        publicFeed: "nasa-eonet",
        publicFeedName: "NASA EONET",
        originalId: "EONET_1234",
        retrievedAt: null,
        payload: rawNasa,
      },
    });
  });

  it("uses NASA EONET geometry history for current coordinates and update time", () => {
    const rawNasa = {
      id: "EONET_4321",
      title: "Flooding update in Queensland, Australia",
      categories: [{ id: "floods", title: "Floods" }],
      geometry: [
        { date: "2026-06-08T04:15:00Z", type: "Point", coordinates: [149.2, -21.4] },
        { date: "2026-06-10T09:45:00Z", type: "Point", coordinates: [150.7, -20.8] },
      ],
    };

    const incident = normalizeNasaEonetIncident(rawNasa);

    expect(incident).toMatchObject({
      id: "nasa-eonet:EONET_4321",
      category: "flood",
      coordinates: { latitude: -20.8, longitude: 150.7 },
      startedAt: "2026-06-08T04:15:00.000Z",
      updatedAt: "2026-06-10T09:45:00.000Z",
      severityScore: 60,
      severityLabel: "strong",
    });
  });

  it("returns null for raw payloads missing required Incident fields", () => {
    expect(
      normalizeUsgsEarthquakeIncident({
        id: "us7000missing",
        properties: { title: "Missing time" },
      }),
    ).toBeNull();

    expect(
      normalizeNasaEonetIncident({
        id: "EONET_missing",
        title: "Missing geometry date",
        geometry: [],
      }),
    ).toBeNull();
  });

  it("uses the shared Incident type in the Feed Adapter result contract", () => {
    const incident = normalizeIncident({
      rawId: "contract-1",
      title: "Contract Incident",
      category: "other",
      source: "nasa-eonet",
      sourceName: "NASA EONET",
      startedAt: "2026-06-10T12:00:00Z",
      rawPayload: { id: "contract-1" },
    });

    expect(incident).not.toBeNull();

    const result: FeedAdapterResult = {
      incidents: [incident as Incident],
      sourceStatus: {
        publicFeed: "nasa-eonet",
        publicFeedName: "NASA EONET",
        state: "success",
        lastAttemptedAt: "2026-06-10T12:01:00.000Z",
        lastSuccessfulAt: "2026-06-10T12:01:00.000Z",
        message: null,
      },
    };

    expect(result.incidents[0]?.source).toBe("nasa-eonet");
  });
});

describe("Incident severity scoring and filters", () => {
  const incidents = [
    normalizeIncident({
      rawId: "quake-1",
      title: "M 7.2 - Offshore earthquake near Alaska",
      category: "earthquake",
      source: "usgs-earthquakes",
      sourceName: "USGS Earthquakes",
      startedAt: "2026-06-10T10:00:00Z",
      severityScore: 72,
      rawPayload: { id: "quake-1" },
    }),
    normalizeIncident({
      rawId: "wildfire-1",
      title: "Wildfire activity in British Columbia",
      category: "wildfire",
      source: "nasa-eonet",
      sourceName: "NASA EONET",
      startedAt: "2026-06-10T11:00:00Z",
      rawPayload: { id: "wildfire-1" },
    }),
    normalizeIncident({
      rawId: "drought-1",
      title: "Drought conditions in eastern Africa",
      category: "drought",
      source: "nasa-eonet",
      sourceName: "NASA EONET",
      startedAt: "2026-06-10T12:00:00Z",
      rawPayload: { id: "drought-1" },
    }),
  ] as Incident[];

  it("assigns consistent Severity Score labels from explicit scores, labels, and categories", () => {
    expect(scoreIncidentSeverity({ category: "earthquake", severityScore: 80 })).toEqual({
      severityScore: 80,
      severityLabel: "major",
    });
    expect(scoreIncidentSeverity({ category: "other", severityLabel: "moderate" })).toEqual({
      severityScore: 40,
      severityLabel: "moderate",
    });
    expect(scoreIncidentSeverity({ category: "wildfire" })).toEqual({
      severityScore: 65,
      severityLabel: "strong",
    });
  });

  it("normalizes Severity Score boundaries before assigning Severity Score labels", () => {
    expect(scoreIncidentSeverity({ category: "other", severityScore: -10 })).toEqual({
      severityScore: 0,
      severityLabel: "minor",
    });
    expect(scoreIncidentSeverity({ category: "other", severityScore: 49.96 })).toEqual({
      severityScore: 50,
      severityLabel: "strong",
    });
    expect(scoreIncidentSeverity({ category: "other", severityScore: 120 })).toEqual({
      severityScore: 100,
      severityLabel: "major",
    });
  });

  it("narrows the Incident set by category, source, severity, and text filters", () => {
    const filtered = filterIncidents(incidents, {
      categories: ["wildfire", "earthquake"],
      sources: ["nasa-eonet"],
      severityLabels: ["strong"],
      text: "British Columbia",
    });

    expect(filtered.map((incident) => incident.id)).toEqual(["nasa-eonet:wildfire-1"]);
  });

  it("matches text filters across Incident identity, source attribution, and severity without reordering results", () => {
    const filtered = filterIncidents(incidents, {
      text: "nasa eonet strong",
    });

    expect(filtered.map((incident) => incident.id)).toEqual(["nasa-eonet:wildfire-1"]);
  });

  it("returns the same Filtered Incident Set for feed and map consumers using the same filters", () => {
    const filters = { sources: ["nasa-eonet"] as const, minSeverityScore: 50 };
    const feedFilteredIncidentSet = filterIncidents(incidents, filters);
    const mapFilteredIncidentSet = filterIncidents([...incidents].reverse().reverse(), filters);

    expect(feedFilteredIncidentSet.map((incident) => incident.id)).toEqual(
      mapFilteredIncidentSet.map((incident) => incident.id),
    );
    expect(feedFilteredIncidentSet.map((incident) => incident.id)).toEqual(["nasa-eonet:wildfire-1"]);
  });

  it("handles empty and mixed-source Incident lists without errors", () => {
    expect(filterIncidents([], { text: "anything", severityLabels: ["major"] })).toEqual([]);
    expect(filterIncidents(incidents, { maxSeverityScore: 49 }).map((incident) => incident.id)).toEqual([
      "nasa-eonet:drought-1",
    ]);
  });
});

describe("USGS Earthquakes Feed Adapter", () => {
  const retrievedAt = new Date("2026-06-10T14:00:00Z");
  const usgsPayload = JSON.parse(
    readFileSync(new URL("./fixtures/usgs-earthquakes.json", import.meta.url), "utf8"),
  ) as UsgsEarthquakeFeedPayload;

  it("fetches recent USGS earthquake data and returns normalized Incidents with attribution and links", async () => {
    const requestedInputs: Array<string | URL> = [];
    const fetcher: FeedAdapterFetch = async (input) => {
      requestedInputs.push(input);
      return {
        ok: true,
        status: 200,
        json: async () => usgsPayload,
      };
    };

    const result = await fetchUsgsEarthquakeFeed({ fetcher, now: () => retrievedAt });

    expect(String(requestedInputs[0])).toBe(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    );
    expect(result.sourceStatus).toEqual({
      publicFeed: "usgs-earthquakes",
      publicFeedName: "USGS Earthquakes",
      state: "success",
      lastAttemptedAt: "2026-06-10T14:00:00.000Z",
      lastSuccessfulAt: "2026-06-10T14:00:00.000Z",
      message: null,
    });
    expect(result.incidents).toHaveLength(2);
    expect(result.incidents[0]).toMatchObject({
      id: "usgs-earthquakes:us7000abcd",
      title: "M 5.4 - 12 km S of Example, Alaska",
      category: "earthquake",
      source: "usgs-earthquakes",
      sourceName: "USGS Earthquakes",
      sourceUrl: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd",
      coordinates: { latitude: 61.2, longitude: -149.9 },
      startedAt: "2026-06-10T12:00:00.000Z",
      updatedAt: "2026-06-10T13:00:00.000Z",
      severityScore: 54,
      severityLabel: "strong",
      rawSource: {
        publicFeed: "usgs-earthquakes",
        publicFeedName: "USGS Earthquakes",
        originalId: "us7000abcd",
        retrievedAt: "2026-06-10T14:00:00.000Z",
        payload: usgsPayload.features?.[0],
      },
    });
  });

  it("reports unavailable Source Status and no Incidents when USGS fetch fails", async () => {
    const fetcher: FeedAdapterFetch = async () => {
      throw new Error("network unavailable");
    };

    const result = await fetchUsgsEarthquakeFeed({ fetcher, now: () => retrievedAt });

    expect(result.incidents).toEqual([]);
    expect(result.sourceStatus).toEqual({
      publicFeed: "usgs-earthquakes",
      publicFeedName: "USGS Earthquakes",
      state: "unavailable",
      lastAttemptedAt: "2026-06-10T14:00:00.000Z",
      lastSuccessfulAt: null,
      message: "USGS Earthquakes fetch failed: network unavailable.",
    });
  });

  it("reports degraded Source Status without fabricating Incidents for unusable USGS payloads", async () => {
    const fetcher: FeedAdapterFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        features: [
          {
            id: "missing-time",
            properties: { title: "Missing time" },
            geometry: { type: "Point", coordinates: [-149.9, 61.2] },
          },
        ],
      }),
    });

    const result = await fetchUsgsEarthquakeFeed({ fetcher, now: () => retrievedAt });

    expect(result.incidents).toEqual([]);
    expect(result.sourceStatus).toEqual({
      publicFeed: "usgs-earthquakes",
      publicFeedName: "USGS Earthquakes",
      state: "degraded",
      lastAttemptedAt: "2026-06-10T14:00:00.000Z",
      lastSuccessfulAt: "2026-06-10T14:00:00.000Z",
      message: "Skipped 1 USGS Earthquakes features missing required Incident fields.",
    });
  });
});

describe("Combined Incident collection", () => {
  const refreshedAt = new Date("2026-06-10T15:00:00Z");
  const usgsPayload = JSON.parse(
    readFileSync(new URL("./fixtures/usgs-earthquakes.json", import.meta.url), "utf8"),
  ) as UsgsEarthquakeFeedPayload;
  const eonetPayload: NasaEonetFeedPayload = {
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

  it("merges USGS and NASA EONET output while keeping the GDACS limitation visible in Source Status", async () => {
    const fetcher: FeedAdapterFetch = async (input) => {
      const url = String(input);

      if (url.startsWith("https://earthquake.usgs.gov/")) {
        return { ok: true, status: 200, json: async () => usgsPayload };
      }

      if (url.startsWith("https://eonet.gsfc.nasa.gov/")) {
        return { ok: true, status: 200, json: async () => eonetPayload };
      }

      throw new Error(`Unexpected Public Feed URL: ${url}`);
    };

    const collection = await fetchCombinedIncidentCollection({
      now: () => refreshedAt,
      usgsEarthquakes: { fetcher },
      nasaEonet: { fetcher, limit: 1 },
    });

    expect(collection.refreshedAt).toBe("2026-06-10T15:00:00.000Z");
    expect(collection.incidents).toHaveLength(3);
    expect(collection.incidents.map((incident) => incident.source).sort()).toEqual([
      "nasa-eonet",
      "usgs-earthquakes",
      "usgs-earthquakes",
    ]);
    expect(collection.sourceStatuses).toEqual([
      {
        publicFeed: "usgs-earthquakes",
        publicFeedName: "USGS Earthquakes",
        state: "success",
        lastAttemptedAt: "2026-06-10T15:00:00.000Z",
        lastSuccessfulAt: "2026-06-10T15:00:00.000Z",
        message: null,
      },
      {
        publicFeed: "nasa-eonet",
        publicFeedName: "NASA EONET",
        state: "success",
        lastAttemptedAt: "2026-06-10T15:00:00.000Z",
        lastSuccessfulAt: "2026-06-10T15:00:00.000Z",
        message: null,
      },
      {
        publicFeed: "gdacs",
        publicFeedName: "GDACS",
        state: "unavailable",
        lastAttemptedAt: "2026-06-10T15:00:00.000Z",
        lastSuccessfulAt: null,
        message: GDACS_BROWSER_RUNTIME_LIMITATION_MESSAGE,
      },
    ]);
    expect(collection.sourceStatusSummary).toEqual({
      sourceCount: 3,
      successCount: 2,
      degradedCount: 0,
      unavailableCount: 1,
      lastAttemptedAt: "2026-06-10T15:00:00.000Z",
      lastSuccessfulAt: "2026-06-10T15:00:00.000Z",
    });
  });

  it("keeps reachable Incidents when one Public Feed is unavailable without inventing substitutes", async () => {
    const fetcher: FeedAdapterFetch = async (input) => {
      const url = String(input);

      if (url.startsWith("https://earthquake.usgs.gov/")) {
        return { ok: true, status: 200, json: async () => usgsPayload };
      }

      throw new Error("NASA EONET outage");
    };

    const collection = await fetchCombinedIncidentCollection({
      now: () => refreshedAt,
      usgsEarthquakes: { fetcher },
      nasaEonet: { fetcher },
      previousSourceStatuses: [
        {
          publicFeed: "nasa-eonet",
          publicFeedName: "NASA EONET",
          state: "success",
          lastAttemptedAt: "2026-06-10T14:45:00.000Z",
          lastSuccessfulAt: "2026-06-10T14:45:00.000Z",
          message: null,
        },
      ],
    });

    expect(collection.incidents).toHaveLength(2);
    expect(collection.incidents.every((incident) => incident.source === "usgs-earthquakes")).toBe(true);
    expect(collection.sourceStatuses).toContainEqual({
      publicFeed: "usgs-earthquakes",
      publicFeedName: "USGS Earthquakes",
      state: "success",
      lastAttemptedAt: "2026-06-10T15:00:00.000Z",
      lastSuccessfulAt: "2026-06-10T15:00:00.000Z",
      message: null,
    });
    expect(collection.sourceStatuses).toContainEqual({
      publicFeed: "nasa-eonet",
      publicFeedName: "NASA EONET",
      state: "unavailable",
      lastAttemptedAt: "2026-06-10T15:00:00.000Z",
      lastSuccessfulAt: "2026-06-10T14:45:00.000Z",
      message: "NASA EONET fetch failed: NASA EONET outage.",
    });
    expect(collection.sourceStatuses).toContainEqual({
      publicFeed: "gdacs",
      publicFeedName: "GDACS",
      state: "unavailable",
      lastAttemptedAt: "2026-06-10T15:00:00.000Z",
      lastSuccessfulAt: null,
      message: GDACS_BROWSER_RUNTIME_LIMITATION_MESSAGE,
    });
    expect(collection.sourceStatusSummary).toMatchObject({
      sourceCount: 3,
      successCount: 1,
      degradedCount: 0,
      unavailableCount: 2,
    });
  });
});

describe("GDACS Public Feed resolution", () => {
  it("documents the probed GDACS RSS endpoint while reporting it unavailable in the browser app runtime", async () => {
    const retrievedAt = new Date("2026-06-10T14:00:00Z");
    const result = await fetchGdacsIncidents({ now: () => retrievedAt });

    expect(GDACS_RSS_FEED_ENDPOINT).toBe("https://www.gdacs.org/xml/rss.xml");
    expect(result.incidents).toEqual([]);
    expect(result.sourceStatus).toEqual({
      publicFeed: "gdacs",
      publicFeedName: "GDACS",
      state: "unavailable",
      lastAttemptedAt: "2026-06-10T14:00:00.000Z",
      lastSuccessfulAt: null,
      message: GDACS_BROWSER_RUNTIME_LIMITATION_MESSAGE,
    });
    expect(result.sourceStatus.message).toContain("browser CORS access");
    expect(result.sourceStatus.message).toContain("USGS Earthquakes and NASA EONET remain active");
  });
});

describe("NASA EONET Feed Adapter", () => {
  const retrievedAt = new Date("2026-06-10T14:00:00Z");
  const eonetPayload: NasaEonetFeedPayload = {
    title: "EONET Events",
    link: "https://eonet.gsfc.nasa.gov/api/v3/events",
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
            type: "Polygon",
            coordinates: [
              [
                [149.2, -21.4],
                [149.5, -21.2],
                [149.1, -21.1],
              ],
            ],
          },
        ],
      },
    ],
  };

  it("builds the current NASA EONET endpoint with default and custom limits", () => {
    expect(buildNasaEonetEventsEndpoint()).toBe("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50");
    expect(buildNasaEonetEventsEndpoint({ limit: 5 })).toBe(
      "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=5",
    );
  });

  it("fetches current NASA EONET data and returns normalized Incidents with attribution and links", async () => {
    const requestedInputs: Array<string | URL> = [];
    const fetcher: FeedAdapterFetch = async (input) => {
      requestedInputs.push(input);
      return {
        ok: true,
        status: 200,
        json: async () => eonetPayload,
      };
    };

    const result = await fetchNasaEonetIncidents({ fetcher, limit: 1, now: () => retrievedAt });

    expect(String(requestedInputs[0])).toBe("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=1");
    expect(result.sourceStatus).toEqual({
      publicFeed: "nasa-eonet",
      publicFeedName: "NASA EONET",
      state: "success",
      lastAttemptedAt: "2026-06-10T14:00:00.000Z",
      lastSuccessfulAt: "2026-06-10T14:00:00.000Z",
      message: null,
    });
    expect(result.incidents).toHaveLength(1);
    expect(result.incidents[0]).toMatchObject({
      id: "nasa-eonet:EONET_9876",
      title: "Flooding in Queensland, Australia",
      category: "flood",
      source: "nasa-eonet",
      sourceName: "NASA EONET",
      sourceUrl: "https://disasters.nasa.gov/example-flood",
      coordinates: { latitude: -21.4, longitude: 149.2 },
      startedAt: "2026-06-08T04:15:00.000Z",
      updatedAt: null,
      severityScore: 60,
      severityLabel: "strong",
      rawSource: {
        publicFeed: "nasa-eonet",
        publicFeedName: "NASA EONET",
        originalId: "EONET_9876",
        retrievedAt: "2026-06-10T14:00:00.000Z",
        payload: eonetPayload.events?.[0],
      },
    });
  });

  it("uses an event link when NASA EONET source links are not available", async () => {
    const fetcher: FeedAdapterFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        events: [
          {
            id: "EONET_5555",
            title: "Volcano activity",
            link: "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_5555",
            categories: [{ id: "volcanoes" }],
            sources: [],
            geometry: [{ date: "2026-06-07T00:00:00Z", type: "Point", coordinates: [12.3, 45.6] }],
          },
        ],
      }),
    });

    const result = await fetchNasaEonetIncidents({ fetcher, now: () => retrievedAt });

    expect(result.incidents[0]?.sourceUrl).toBe("https://eonet.gsfc.nasa.gov/api/v3/events/EONET_5555");
  });

  it("reports unavailable Source Status and no Incidents when NASA EONET fetch fails", async () => {
    const fetcher: FeedAdapterFetch = async () => {
      throw new Error("network unavailable");
    };

    const result = await fetchNasaEonetIncidents({ fetcher, now: () => retrievedAt });

    expect(result.incidents).toEqual([]);
    expect(result.sourceStatus).toEqual({
      publicFeed: "nasa-eonet",
      publicFeedName: "NASA EONET",
      state: "unavailable",
      lastAttemptedAt: "2026-06-10T14:00:00.000Z",
      lastSuccessfulAt: null,
      message: "NASA EONET fetch failed: network unavailable.",
    });
  });

  it("reports degraded Source Status without fabricating Incidents for unusable NASA EONET payloads", async () => {
    const fetcher: FeedAdapterFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ events: [{ id: "missing-date", title: "Missing date", geometry: [] }] }),
    });

    const result = await fetchNasaEonetIncidents({ fetcher, now: () => retrievedAt });

    expect(result.incidents).toEqual([]);
    expect(result.sourceStatus).toEqual({
      publicFeed: "nasa-eonet",
      publicFeedName: "NASA EONET",
      state: "degraded",
      lastAttemptedAt: "2026-06-10T14:00:00.000Z",
      lastSuccessfulAt: "2026-06-10T14:00:00.000Z",
      message: "Skipped 1 NASA EONET payloads missing required Incident fields.",
    });
  });
});
