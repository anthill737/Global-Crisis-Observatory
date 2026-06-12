import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  normalizeNasaEonetIncident,
  normalizeUsgsEarthquakeIncident,
  type Incident,
  type NasaEonetIncidentPayload,
  type UsgsEarthquakeFeedPayload,
} from "../src/lib/incidents";
import {
  SAVED_EVENTS_STORAGE_KEY,
  buildSavedEventViewItems,
  createSavedEvent,
  loadSavedEvents,
  persistSavedEvents,
  removeSavedEvent,
  saveIncidentAsSavedEvent,
  type SavedEventStorageAdapter,
} from "../src/lib/saved-events";

const refreshedAt = "2026-06-10T15:30:00.000Z";

class MemoryStorage implements SavedEventStorageAdapter {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class ThrowingStorage implements SavedEventStorageAdapter {
  getItem(_key: string): string | null {
    throw new Error("localStorage is unavailable");
  }

  setItem(_key: string, _value: string): void {
    throw new Error("localStorage quota exceeded");
  }

  removeItem(_key: string): void {
    throw new Error("localStorage removal denied");
  }
}

function loadUsgsFixtureIncident(featureIndex = 0): Incident {
  const payload = JSON.parse(readFileSync("tests/fixtures/usgs-earthquakes.json", "utf8")) as UsgsEarthquakeFeedPayload;
  const feature = payload.features?.[featureIndex];
  if (feature === undefined) {
    throw new Error(`USGS Earthquakes fixture is missing feature ${featureIndex}.`);
  }

  const incident = normalizeUsgsEarthquakeIncident(feature, { retrievedAt: refreshedAt });
  if (incident === null) {
    throw new Error("USGS Earthquakes fixture did not normalize into an Incident.");
  }

  return incident;
}

function buildNasaEonetFixtureIncident(overrides: Partial<NasaEonetIncidentPayload> = {}): Incident {
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
    ...overrides,
  };
  const incident = normalizeNasaEonetIncident(payload, { retrievedAt: refreshedAt });
  if (incident === null) {
    throw new Error("NASA EONET fixture did not normalize into an Incident.");
  }

  return incident;
}

describe("Saved Event persistence", () => {
  it("serializes enough public Incident source detail for browser-local revisiting", () => {
    const incident = loadUsgsFixtureIncident();

    const savedEvent = createSavedEvent(incident, "2026-06-10T16:00:00.000Z");

    expect(savedEvent).toEqual({
      version: 1,
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
      originalSourceId: "us7000abcd",
      sourceRetrievedAt: "2026-06-10T15:30:00.000Z",
      savedAt: "2026-06-10T16:00:00.000Z",
    });
  });

  it("loads Saved Events from local storage across refreshes on the same machine", () => {
    const storage = new MemoryStorage();
    const incident = loadUsgsFixtureIncident();
    saveIncidentAsSavedEvent(incident, { storage, savedAt: "2026-06-10T16:00:00.000Z" });

    const reloadedSavedEvents = loadSavedEvents(storage);

    expect(reloadedSavedEvents).toHaveLength(1);
    expect(reloadedSavedEvents[0]).toEqual(
      expect.objectContaining({
        id: "usgs-earthquakes:us7000abcd",
        title: "M 5.4 - 12 km S of Example, Alaska",
        sourceName: "USGS Earthquakes",
        originalSourceId: "us7000abcd",
      }),
    );
  });

  it("tolerates missing, malformed, non-array, and invalid local storage data", () => {
    const storage = new MemoryStorage();

    expect(loadSavedEvents(storage)).toEqual([]);

    storage.setItem(SAVED_EVENTS_STORAGE_KEY, "not-json");
    expect(loadSavedEvents(storage)).toEqual([]);

    storage.setItem(SAVED_EVENTS_STORAGE_KEY, JSON.stringify({ id: "not-an-array" }));
    expect(loadSavedEvents(storage)).toEqual([]);

    storage.setItem(SAVED_EVENTS_STORAGE_KEY, JSON.stringify([{ id: "missing-required-fields" }]));
    expect(loadSavedEvents(storage)).toEqual([]);
  });

  it("falls back safely when browser storage APIs throw", () => {
    const storage = new ThrowingStorage();
    const incident = loadUsgsFixtureIncident();

    expect(loadSavedEvents(storage)).toEqual([]);
    expect(saveIncidentAsSavedEvent(incident, { storage, savedAt: "2026-06-10T16:00:00.000Z" })).toEqual([
      expect.objectContaining({ id: "usgs-earthquakes:us7000abcd" }),
    ]);
    expect(removeSavedEvent("usgs-earthquakes:us7000abcd", storage)).toEqual([]);
  });

  it("removes each Saved Event individually and updates storage immediately", () => {
    const storage = new MemoryStorage();
    const firstIncident = loadUsgsFixtureIncident();
    const secondIncident = buildNasaEonetFixtureIncident();

    saveIncidentAsSavedEvent(firstIncident, { storage, savedAt: "2026-06-10T16:00:00.000Z" });
    saveIncidentAsSavedEvent(secondIncident, { storage, savedAt: "2026-06-10T17:00:00.000Z" });

    const remainingSavedEvents = removeSavedEvent("usgs-earthquakes:us7000abcd", storage);

    expect(remainingSavedEvents.map((savedEvent) => savedEvent.id)).toEqual(["nasa-eonet:EONET_7777"]);
    expect(loadSavedEvents(storage).map((savedEvent) => savedEvent.id)).toEqual(["nasa-eonet:EONET_7777"]);
  });

  it("clears local storage when the final Saved Event is removed", () => {
    const storage = new MemoryStorage();
    saveIncidentAsSavedEvent(loadUsgsFixtureIncident(), { storage, savedAt: "2026-06-10T16:00:00.000Z" });

    const remainingSavedEvents = removeSavedEvent("usgs-earthquakes:us7000abcd", storage);

    expect(remainingSavedEvents).toEqual([]);
    expect(storage.getItem(SAVED_EVENTS_STORAGE_KEY)).toBeNull();
    expect(loadSavedEvents(storage)).toEqual([]);
  });

  it("labels removed or no-longer-live source events without dropping the Saved Event", () => {
    const liveIncident = loadUsgsFixtureIncident();
    const liveSavedEvent = createSavedEvent(liveIncident, "2026-06-10T16:00:00.000Z");
    const staleSavedEvent = createSavedEvent(
      buildNasaEonetFixtureIncident({ id: "EONET_RETIRED", title: "Retired wildfire Incident" }),
      "2026-06-10T15:00:00.000Z",
    );

    const viewItems = buildSavedEventViewItems([liveSavedEvent, staleSavedEvent], [liveIncident]);

    expect(viewItems).toHaveLength(2);
    expect(viewItems.find((item) => item.savedEvent.id === "usgs-earthquakes:us7000abcd")).toEqual(
      expect.objectContaining({
        isLive: true,
        statusText: "Live in the current Public Feed refresh.",
      }),
    );
    expect(viewItems.find((item) => item.savedEvent.id === "nasa-eonet:EONET_RETIRED")).toEqual(
      expect.objectContaining({
        isLive: false,
        liveIncident: null,
        statusText: "No longer live in the current Public Feed refresh; showing saved source details.",
      }),
    );
  });

  it("keeps the newest Saved Event snapshot when duplicate ids are persisted", () => {
    const storage = new MemoryStorage();
    const incident = loadUsgsFixtureIncident();
    const olderSavedEvent = createSavedEvent(incident, "2026-06-10T15:00:00.000Z");
    const newerSavedEvent = createSavedEvent({ ...incident, title: "Updated public source title" }, "2026-06-10T16:00:00.000Z");

    persistSavedEvents([olderSavedEvent, newerSavedEvent], storage);

    expect(loadSavedEvents(storage)).toEqual([expect.objectContaining({ title: "Updated public source title" })]);
  });
});
