import { describe, expect, it, vi } from "vitest";
import {
  AI_BRIEFING_API_ENDPOINT,
  AiBriefingConfigurationError,
  AiBriefingRequestError,
  buildFilteredIncidentSetBriefingRequest,
  buildSingleIncidentBriefingRequest,
  generateAiBriefing,
  type AiBriefingFetch,
} from "../src/lib/ai-briefing";
import { generateOpenAiBriefing } from "../src/lib/ai-briefing-server";
import type { Incident } from "../src/lib/incidents";

const incident: Incident = {
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
    retrievedAt: "2026-06-10T15:30:00.000Z",
    payload: {
      properties: { mag: 5.4 },
      privateOperationalNote: "must never be sent",
    },
  },
};

describe("AI Briefing request pipeline", () => {
  it("builds an explicit selected Incident request with only public Incident fields", () => {
    const request = buildSingleIncidentBriefingRequest(incident);

    expect(request).toEqual({
      requestedOutput: {
        situationSummary: true,
        likelyImpactConsiderations: true,
        responsePriorityRecommendations: true,
        uncertaintyNotes: true,
      },
      publicDataNotice: "Use only the public Incident fields in this payload. Do not request PII, confidential context, or private operational data.",
      scope: {
        kind: "selected_incident",
        label: "selected Incident",
        incident: {
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
          sourceRecord: {
            publicFeed: "usgs-earthquakes",
            publicFeedName: "USGS Earthquakes",
            originalId: "alpha",
            retrievedAt: "2026-06-10T15:30:00.000Z",
          },
        },
      },
    });
    expect(JSON.stringify(request)).not.toContain("privateOperationalNote");
    expect(JSON.stringify(request)).not.toContain("\"payload\"");
  });

  it("builds an explicit Filtered Incident Set request with sanitized non-text filters", () => {
    const request = buildFilteredIncidentSetBriefingRequest([incident], {
      categories: ["earthquake"],
      sources: ["usgs-earthquakes"],
      severityLabels: ["strong"],
      minSeverityScore: 50,
      maxSeverityScore: Number.NaN,
      text: " Alaska ",
    });
    const singleIncidentScope = buildSingleIncidentBriefingRequest(incident).scope;
    if (singleIncidentScope.kind !== "selected_incident") {
      throw new Error("Expected a selected Incident AI Briefing scope.");
    }
    if (request.scope.kind !== "filtered_incident_set") {
      throw new Error("Expected a Filtered Incident Set AI Briefing scope.");
    }
    const expectedIncident = singleIncidentScope.incident;

    expect(request.scope).toMatchObject({
      label: "Filtered Incident Set",
      incidentCount: 1,
      filters: {
        categories: ["earthquake"],
        sources: ["usgs-earthquakes"],
        severityLabels: ["strong"],
        minSeverityScore: 50,
      },
      incidents: [expectedIncident],
    });
    expect(request.scope.filters).not.toHaveProperty("text");
    expect(JSON.stringify(request.scope)).not.toContain("NaN");
  });

  it("posts public payloads to the same-origin AI Briefing API without a client-side key", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        situationSummary: "A strong earthquake was reported near Example, Alaska.",
        impactConsiderations: "People nearby may experience shaking and aftershock disruption.",
        responsePriorityRecommendation: "Review strong Severity Score Incidents first while checking local public updates.",
        uncertaintyNotes: ["Magnitude and location can change as the Public Feed revises the Incident."],
      }),
    })) satisfies AiBriefingFetch;

    const output = await generateAiBriefing(buildSingleIncidentBriefingRequest(incident), { fetcher });

    expect(output).toEqual({
      situationSummary: "A strong earthquake was reported near Example, Alaska.",
      impactConsiderations: "People nearby may experience shaking and aftershock disruption.",
      responsePriorityRecommendation: "Review strong Severity Score Incidents first while checking local public updates.",
      uncertaintyNotes: ["Magnitude and location can change as the Public Feed revises the Incident."],
    });
    expect(fetcher).toHaveBeenCalledWith(
      AI_BRIEFING_API_ENDPOINT,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.not.stringContaining("sk-"),
      }),
    );
  });

  it("renders required AI Briefing output sections from an OpenAI response on the server path", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify({
          situationSummary: "A strong earthquake was reported near Example, Alaska.",
          likelyImpactConsiderations: ["People nearby may experience shaking and aftershock disruption."],
          responsePriorityRecommendations: ["Review strong Severity Score Incidents first while checking local public updates."],
          uncertaintyNotes: ["Magnitude and location can change as the Public Feed revises the Incident."],
        }),
      }),
    })) satisfies AiBriefingFetch;

    const output = await generateOpenAiBriefing({
      payload: buildSingleIncidentBriefingRequest(incident),
      apiKey: "sk-test",
      fetcher,
    });

    expect(output).toEqual({
      situationSummary: "A strong earthquake was reported near Example, Alaska.",
      impactConsiderations: "People nearby may experience shaking and aftershock disruption.",
      responsePriorityRecommendation: "Review strong Severity Score Incidents first while checking local public updates.",
      uncertaintyNotes: ["Magnitude and location can change as the Public Feed revises the Incident."],
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-test" }),
      }),
    );
  });

  it("reports missing and invalid OPENAI_API_KEY configuration safely", async () => {
    await expect(generateOpenAiBriefing({ payload: buildSingleIncidentBriefingRequest(incident), apiKey: "" })).rejects.toBeInstanceOf(
      AiBriefingConfigurationError,
    );

    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    })) satisfies AiBriefingFetch;
    await expect(
      generateOpenAiBriefing({
        payload: buildSingleIncidentBriefingRequest(incident),
        apiKey: "sk-invalid",
        fetcher,
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("OPENAI_API_KEY was rejected"),
    });
  });

  it("keeps generic briefing failures obvious without throwing configuration errors", async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: "Server Error",
      json: async () => ({}),
    })) satisfies AiBriefingFetch;

    await expect(
      generateOpenAiBriefing({
        payload: buildSingleIncidentBriefingRequest(incident),
        apiKey: "sk-test",
        fetcher,
      }),
    ).rejects.toBeInstanceOf(AiBriefingRequestError);
  });
});
