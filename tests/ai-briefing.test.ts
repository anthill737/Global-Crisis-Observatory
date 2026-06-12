import { describe, expect, it, vi } from "vitest";
import {
  AI_BRIEFING_API_ENDPOINT,
  AiBriefingConfigurationError,
  AiBriefingRequestError,
  buildFilteredIncidentSetBriefingRequest,
  buildSingleIncidentBriefingRequest,
  buildSelectedIncidentPublicSocialContext,
  generateAiBriefing,
  type AiBriefingFetch,
  validateAiBriefingRequestPayload,
} from "../src/lib/ai-briefing";
import {
  ANTHROPIC_MESSAGES_ENDPOINT,
  generateAnthropicAiBriefing,
  generateGeminiAiBriefing,
  generateOpenAiBriefing,
  generateProviderAiBriefing,
  GEMINI_GENERATE_CONTENT_ENDPOINT_BASE,
} from "../src/lib/ai-briefing-server";
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

  it("omits unsafe Incident sourceUrl values from selected and Filtered Incident Set payloads", () => {
    const incidentWithUnsafeUrl: Incident = {
      ...incident,
      sourceUrl: "https://social.example/@named_user/status/123",
    };

    const selectedIncidentRequest = buildSingleIncidentBriefingRequest(incidentWithUnsafeUrl);
    const filteredIncidentSetRequest = buildFilteredIncidentSetBriefingRequest([incidentWithUnsafeUrl]);

    expect(selectedIncidentRequest.scope).toMatchObject({
      kind: "selected_incident",
      incident: expect.objectContaining({ sourceUrl: null }),
    });
    expect(filteredIncidentSetRequest.scope).toMatchObject({
      kind: "filtered_incident_set",
      incidents: [expect.objectContaining({ sourceUrl: null })],
    });
    validateAiBriefingRequestPayload(selectedIncidentRequest);
    validateAiBriefingRequestPayload(filteredIncidentSetRequest);
    expect(JSON.stringify(selectedIncidentRequest)).not.toContain("@named_user");
    expect(JSON.stringify(filteredIncidentSetRequest)).not.toContain("@named_user");
  });

  it("adds provider-safe Public Social Context with only localized public signals", () => {
    const request = buildSingleIncidentBriefingRequest(incident, {
      aiBriefingChoice: "openai",
      publicSocialContext: {
        locality: "Anchorage area",
        signals: [
          {
            topic: "Transit disruption",
            localizedSummary: "Public posts and local reports describe delayed buses near the affected area.",
            sourceType: "public_social",
            observedAt: "2026-06-10T14:00:00.000Z",
            sourceUrl: "https://example.org/public-update",
          },
          {
            topic: "Unsafe identity detail",
            localizedSummary: "@named_user said \"my address is 10 Main Street\"",
            sourceType: "public_social",
          },
          {
            topic: "Single-quoted direct quote",
            localizedSummary: "Public posts say 'the bridge is out' near the affected area.",
            sourceType: "public_social",
          },
          {
            topic: "Contact details",
            localizedSummary: "Call +1 555 123 4567 for private updates.",
            sourceType: "public_web",
          },
          {
            topic: "Public transport update",
            localizedSummary: "Public reports describe shuttle delays near the rail station.",
            sourceType: "public_social",
            sourceUrl: "https://social.example/@named_user/status/123",
          },
        ],
      },
    });

    expect(request.publicSocialContext).toEqual({
      safetyNotice: "Localized public signal summaries aggregated from public sources.",
      locality: "Anchorage area",
      signals: [
        {
          topic: "Transit disruption",
          localizedSummary: "Public posts and local reports describe delayed buses near the affected area.",
          sourceType: "public_social",
          observedAt: "2026-06-10T14:00:00.000Z",
          sourceUrl: "https://example.org/public-update",
        },
        {
          topic: "Public transport update",
          localizedSummary: "Public reports describe shuttle delays near the rail station.",
          sourceType: "public_social",
          observedAt: null,
          sourceUrl: null,
        },
      ],
    });
    validateAiBriefingRequestPayload(request);
    expect(JSON.stringify(request)).not.toContain("@named_user");
    expect(JSON.stringify(request)).not.toContain("10 Main Street");
    expect(JSON.stringify(request)).not.toContain("the bridge is out");
    expect(JSON.stringify(request)).not.toContain("+1 555 123 4567");
  });

  it("shapes selected-Incident Public Social Context from local public source facts", () => {
    const publicSocialContext = buildSelectedIncidentPublicSocialContext(incident, "gemini");

    expect(publicSocialContext).toEqual({
      safetyNotice: "Localized public signal summaries aggregated from public sources.",
      locality: "12 km S of Example, Alaska",
      signals: [
        {
          topic: "Earthquake public context scope",
          localizedSummary:
            "Broad public signals are relevant only when they match the selected Earthquake Incident near 12 km S of Example, Alaska and its source-attributed facts.",
          sourceType: "public_social",
          observedAt: "2026-06-10T12:00:00.000Z",
          sourceUrl: "https://earthquake.usgs.gov/earthquakes/eventpage/alpha",
        },
        {
          topic: "Source separation",
          localizedSummary:
            "USGS Earthquakes remains the core Public Feed source; treat broader public context as separate, contextual, and uncertain.",
          sourceType: "public_official",
          observedAt: "2026-06-10T15:30:00.000Z",
          sourceUrl: "https://earthquake.usgs.gov/earthquakes/eventpage/alpha",
        },
      ],
    });

    const request = buildSingleIncidentBriefingRequest(incident, { aiBriefingChoice: "gemini", publicSocialContext });
    validateAiBriefingRequestPayload(request);
    expect(request.publicSocialContext).toEqual(publicSocialContext);
    expect(JSON.stringify(request)).not.toContain("privateOperationalNote");
    expect(JSON.stringify(request)).not.toContain("@");
  });

  it("fails closed instead of shaping Public Social Context for Disabled or unsafe selected Incidents", () => {
    expect(buildSelectedIncidentPublicSocialContext(incident, "disabled")).toBeNull();
    expect(
      buildSelectedIncidentPublicSocialContext(
        {
          ...incident,
          title: 'M 5.4 - Example resident said "my address is 10 Main Street"',
        },
        "openai",
      ),
    ).toBeNull();
  });

  it("omits Public Social Context when unavailable or unsupported while keeping the public request shape valid", () => {
    const unavailableContextRequest = buildFilteredIncidentSetBriefingRequest(
      [incident],
      {},
      {
        aiBriefingChoice: "anthropic",
        publicSocialContext: {
          locality: " ",
          signals: [],
        },
      },
    );
    const disabledContextRequest = buildSingleIncidentBriefingRequest(incident, {
      aiBriefingChoice: "disabled",
      publicSocialContext: {
        locality: "Anchorage area",
        signals: [
          {
            topic: "Shelter capacity",
            localizedSummary: "Public local updates describe longer lines near open shelters.",
            sourceType: "public_official",
          },
        ],
      },
    });

    expect(unavailableContextRequest).not.toHaveProperty("publicSocialContext");
    expect(disabledContextRequest).not.toHaveProperty("publicSocialContext");
    validateAiBriefingRequestPayload(unavailableContextRequest);
    validateAiBriefingRequestPayload(disabledContextRequest);
    expect(unavailableContextRequest.requestedOutput).toEqual({
      situationSummary: true,
      likelyImpactConsiderations: true,
      responsePriorityRecommendations: true,
      uncertaintyNotes: true,
    });
  });

  it("posts public payloads to the same-origin AI Briefing API without a client-side key", async () => {
    const fetcher = vi.fn(async (_input: string | URL, _init) => ({
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
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      aiBriefingProvider: "openai",
      payload: requestWithScope("selected_incident"),
    });
  });

  it("sends the selected AI Briefing Provider and sends no request when Disabled", async () => {
    const fetcher = vi.fn(async (_input: string | URL, _init) => ({
      ok: true,
      status: 200,
      json: async () => ({
        situationSummary: "A strong earthquake was reported near Example, Alaska.",
        impactConsiderations: "People nearby may experience shaking and aftershock disruption.",
        responsePriorityRecommendation: "Review strong Severity Score Incidents first while checking local public updates.",
        uncertaintyNotes: ["Magnitude and location can change as the Public Feed revises the Incident."],
      }),
    })) satisfies AiBriefingFetch;

    await generateAiBriefing(buildSingleIncidentBriefingRequest(incident), {
      aiBriefingChoice: "anthropic",
      fetcher,
    });

    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      aiBriefingProvider: "anthropic",
      payload: requestWithScope("selected_incident"),
    });

    await expect(
      generateAiBriefing(buildSingleIncidentBriefingRequest(incident), {
        aiBriefingChoice: "disabled",
        fetcher,
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("AI Briefing Choice is Disabled"),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
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

  it("routes server AI Briefings through only the selected provider key", async () => {
    const fetcher = vi.fn(async (input: string | URL, _init) => {
      expect(String(input)).toBe(ANTHROPIC_MESSAGES_ENDPOINT);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                situationSummary: "Anthropic summarized the public Incident.",
                likelyImpactConsiderations: ["Public impacts may evolve."],
                responsePriorityRecommendations: ["Review high Severity Score Incidents first."],
                uncertaintyNotes: ["Public Feed details may change."],
              }),
            },
          ],
        }),
      };
    }) satisfies AiBriefingFetch;

    const output = await generateProviderAiBriefing({
      payload: buildSingleIncidentBriefingRequest(incident),
      aiBriefingProvider: "anthropic",
      apiKeys: { anthropic: "anthropic-key" },
      fetcher,
    });

    expect(output.situationSummary).toBe("Anthropic summarized the public Incident.");
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ "x-api-key": "anthropic-key" });
  });

  it("does not require unselected provider keys", async () => {
    const fetcher = vi.fn(async (_input: string | URL, _init) => ({
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify({
          situationSummary: "OpenAI summarized the public Incident.",
          likelyImpactConsiderations: ["Public impacts may evolve."],
          responsePriorityRecommendations: ["Review high Severity Score Incidents first."],
          uncertaintyNotes: ["Public Feed details may change."],
        }),
      }),
    })) satisfies AiBriefingFetch;

    await expect(
      generateProviderAiBriefing({
        payload: buildSingleIncidentBriefingRequest(incident),
        aiBriefingProvider: "openai",
        apiKeys: { openai: "sk-test", anthropic: null, gemini: null },
        fetcher,
      }),
    ).resolves.toMatchObject({ situationSummary: "OpenAI summarized the public Incident." });
  });

  it("reports selected-provider missing keys and quota failures clearly", async () => {
    await expect(
      generateProviderAiBriefing({
        payload: buildSingleIncidentBriefingRequest(incident),
        aiBriefingProvider: "gemini",
        apiKeys: { openai: "sk-test" },
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("GEMINI_API_KEY is not configured"),
    });

    const fetcher = vi.fn(async (_input: string | URL, _init) => ({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      json: async () => ({ error: { message: "Quota exceeded" } }),
    })) satisfies AiBriefingFetch;

    await expect(
      generateOpenAiBriefing({
        payload: buildSingleIncidentBriefingRequest(incident),
        apiKey: "sk-test",
        fetcher,
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("quota or rate limit"),
    });
  });

  it("does not dispatch Public Social Context to a provider without the matching API key", async () => {
    const fetcher = vi.fn(async (_input: string | URL, _init) => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    })) satisfies AiBriefingFetch;
    const payload = buildSingleIncidentBriefingRequest(incident, {
      aiBriefingChoice: "anthropic",
      publicSocialContext: buildSelectedIncidentPublicSocialContext(incident, "anthropic"),
    });

    await expect(
      generateProviderAiBriefing({
        payload,
        aiBriefingProvider: "anthropic",
        apiKeys: { openai: "sk-test", anthropic: "", gemini: "gemini-key" },
        fetcher,
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("ANTHROPIC_API_KEY is not configured"),
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports provider-specific authentication failures for the selected AI Briefing Provider", async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      json: async () => ({ error: { message: "Invalid key" } }),
    })) satisfies AiBriefingFetch;
    const payload = buildSingleIncidentBriefingRequest(incident);

    await expect(generateAnthropicAiBriefing({ payload, apiKey: "anthropic-invalid", fetcher })).rejects.toMatchObject({
      message: expect.stringContaining("ANTHROPIC_API_KEY was rejected by Anthropic"),
    });
    await expect(generateGeminiAiBriefing({ payload, apiKey: "gemini-invalid", fetcher })).rejects.toMatchObject({
      message: expect.stringContaining("GEMINI_API_KEY was rejected by Gemini"),
    });
  });

  it("renders required AI Briefing output sections from a Gemini response on the server path", async () => {
    const fetcher = vi.fn(async (input: string | URL, _init) => {
      expect(String(input)).toContain(GEMINI_GENERATE_CONTENT_ENDPOINT_BASE);
      expect(String(input)).toContain("key=gemini-key");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      situationSummary: "Gemini summarized the public Incident.",
                      likelyImpactConsiderations: ["Public impacts may evolve."],
                      responsePriorityRecommendations: ["Review high Severity Score Incidents first."],
                      uncertaintyNotes: ["Public Feed details may change."],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      };
    }) satisfies AiBriefingFetch;

    const output = await generateGeminiAiBriefing({
      payload: buildSingleIncidentBriefingRequest(incident),
      apiKey: "gemini-key",
      fetcher,
    });

    expect(output).toEqual({
      situationSummary: "Gemini summarized the public Incident.",
      impactConsiderations: "Public impacts may evolve.",
      responsePriorityRecommendation: "Review high Severity Score Incidents first.",
      uncertaintyNotes: ["Public Feed details may change."],
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

  it("sends provider request bodies with only public AI Briefing fields and safe Public Social Context", async () => {
    const payload = buildSingleIncidentBriefingRequest(incident, {
      aiBriefingChoice: "openai",
      publicSocialContext: {
        locality: "Anchorage area",
        signals: [
          {
            topic: "Transit disruption",
            localizedSummary: "Public local updates describe delayed buses near the affected area.",
            sourceType: "public_social",
          },
        ],
      },
    });
    const fetcher = vi.fn(async (input: string | URL, init) => {
      const endpoint = String(input);
      const requestBody = JSON.parse(String(init?.body));
      const embeddedPayload = readEmbeddedProviderPayload(endpoint, requestBody);

      expect(embeddedPayload).toMatchObject({
        publicDataNotice: expect.stringContaining("Use only the public Incident fields"),
        publicSocialContext: {
          safetyNotice: "Localized public signal summaries aggregated from public sources.",
          locality: "Anchorage area",
          signals: [expect.objectContaining({ topic: "Transit disruption", sourceType: "public_social" })],
        },
        requestedOutput: {
          situationSummary: true,
          likelyImpactConsiderations: true,
          responsePriorityRecommendations: true,
          uncertaintyNotes: true,
        },
        scope: expect.objectContaining({ kind: "selected_incident" }),
      });
      expect(JSON.stringify(requestBody)).not.toContain("privateOperationalNote");
      expect(JSON.stringify(requestBody)).not.toContain("\"payload\":{\"properties\"");
      expect(JSON.stringify(requestBody)).not.toContain("sk-test");
      expect(JSON.stringify(requestBody)).not.toContain("anthropic-key");
      expect(JSON.stringify(requestBody)).not.toContain("gemini-key");

      if (endpoint === ANTHROPIC_MESSAGES_ENDPOINT) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            content: [{ type: "text", text: providerBriefingJson("Anthropic summarized safe public context.") }],
          }),
        };
      }
      if (endpoint.includes(GEMINI_GENERATE_CONTENT_ENDPOINT_BASE)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: providerBriefingJson("Gemini summarized safe public context.") }] } }],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ output_text: providerBriefingJson("OpenAI summarized safe public context.") }),
      };
    }) satisfies AiBriefingFetch;

    await expect(
      generateProviderAiBriefing({ payload, aiBriefingProvider: "openai", apiKeys: { openai: "sk-test" }, fetcher }),
    ).resolves.toMatchObject({ situationSummary: "OpenAI summarized safe public context." });
    await expect(
      generateProviderAiBriefing({ payload, aiBriefingProvider: "anthropic", apiKeys: { anthropic: "anthropic-key" }, fetcher }),
    ).resolves.toMatchObject({ situationSummary: "Anthropic summarized safe public context." });
    await expect(
      generateProviderAiBriefing({ payload, aiBriefingProvider: "gemini", apiKeys: { gemini: "gemini-key" }, fetcher }),
    ).resolves.toMatchObject({ situationSummary: "Gemini summarized safe public context." });
  });
});

function requestWithScope(kind: "selected_incident" | "filtered_incident_set"): object {
  return {
    scope: expect.objectContaining({ kind }),
  };
}

function providerBriefingJson(situationSummary: string): string {
  return JSON.stringify({
    situationSummary,
    likelyImpactConsiderations: ["Public impacts may evolve."],
    responsePriorityRecommendations: ["Review high Severity Score Incidents first."],
    uncertaintyNotes: ["Public Feed details may change."],
  });
}

function readEmbeddedProviderPayload(endpoint: string, requestBody: Record<string, unknown>): unknown {
  if (endpoint === ANTHROPIC_MESSAGES_ENDPOINT) {
    const messages = requestBody.messages;
    if (!Array.isArray(messages) || typeof messages[0]?.content !== "string") {
      throw new Error("Anthropic request is missing its public AI Briefing payload.");
    }
    return JSON.parse(messages[0].content).payload;
  }

  if (endpoint.includes(GEMINI_GENERATE_CONTENT_ENDPOINT_BASE)) {
    const contents = requestBody.contents;
    const firstContent = Array.isArray(contents) ? contents[0] : null;
    const parts = typeof firstContent === "object" && firstContent !== null && "parts" in firstContent ? firstContent.parts : null;
    const firstPart = Array.isArray(parts) ? parts[0] : null;
    const text = typeof firstPart === "object" && firstPart !== null && "text" in firstPart ? firstPart.text : null;
    if (typeof text !== "string" || !text.includes(" Payload: ")) {
      throw new Error("Gemini request is missing its public AI Briefing payload.");
    }
    return JSON.parse(text.split(" Payload: ").at(-1) ?? "");
  }

  const input = requestBody.input;
  if (!Array.isArray(input) || typeof input[1]?.content !== "string") {
    throw new Error("OpenAI request is missing its public AI Briefing payload.");
  }
  return JSON.parse(input[1].content);
}
