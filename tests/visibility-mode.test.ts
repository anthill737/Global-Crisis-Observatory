// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  VISIBILITY_MODE_STORAGE_KEY,
  applyVisibilityMode,
  formatVisibilityModeLabel,
  formatVisibilityModeStatus,
  loadVisibilityMode,
  persistVisibilityMode,
} from "../src/lib/visibility-mode";

function stubPublicFeedFetch(): void {
  const usgsPayload = JSON.parse(
    readFileSync("tests/fixtures/usgs-earthquakes.json", "utf8"),
  ) as unknown;
  const nasaPayload = {
    title: "EONET Events",
    events: [
      {
        id: "EONET_7777",
        title: "Wildfire activity in British Columbia, Canada",
        categories: [{ id: "wildfires", title: "Wildfires" }],
        sources: [{ id: "nasa", url: "https://eonet.gsfc.nasa.gov/events/EONET_7777" }],
        geometry: [
          {
            date: "2026-06-09T18:30:00.000Z",
            type: "Point",
            coordinates: [-123.1, 53.7],
          },
        ],
      },
    ],
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const endpoint = String(input);
      return {
        ok: true,
        json: async () => (endpoint.includes("eonet") ? nasaPayload : usgsPayload),
      };
    }),
  );
}

async function waitForRenderedDashboard(): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (document.body.textContent?.includes("Live public Incidents")) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error(`Dashboard did not finish rendering live Incident surfaces. Last output: ${document.body.innerHTML}`);
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  window.localStorage.clear();
  delete document.documentElement.dataset.visibilityMode;
});

describe("Visibility Mode persistence", () => {
  it("defaults to dark mode when browser storage is empty or unavailable", () => {
    expect(loadVisibilityMode(null)).toBe("dark");
    expect(loadVisibilityMode()).toBe("dark");
  });

  it("persists and restores light, dark, and high-contrast Visibility Modes", () => {
    expect(persistVisibilityMode("light")).toBe("light");
    expect(window.localStorage.getItem(VISIBILITY_MODE_STORAGE_KEY)).toBe("light");
    expect(loadVisibilityMode()).toBe("light");

    expect(persistVisibilityMode("dark")).toBe("dark");
    expect(window.localStorage.getItem(VISIBILITY_MODE_STORAGE_KEY)).toBe("dark");
    expect(loadVisibilityMode()).toBe("dark");

    expect(persistVisibilityMode("high-contrast")).toBe("high-contrast");
    expect(window.localStorage.getItem(VISIBILITY_MODE_STORAGE_KEY)).toBe("high-contrast");
    expect(loadVisibilityMode()).toBe("high-contrast");
  });

  it("ignores unsupported stored values and keeps the dashboard readable", () => {
    window.localStorage.setItem(VISIBILITY_MODE_STORAGE_KEY, "sepia");

    expect(loadVisibilityMode()).toBe("dark");
  });

  it("formats labels for the Settings Control", () => {
    expect(formatVisibilityModeLabel("light")).toBe("Light");
    expect(formatVisibilityModeLabel("dark")).toBe("Dark");
    expect(formatVisibilityModeLabel("high-contrast")).toBe("High contrast");
  });

  it("formats the restored Visibility Mode status shown in the Settings Control", () => {
    expect(formatVisibilityModeStatus("light")).toBe("Current Visibility Mode: Light");
    expect(formatVisibilityModeStatus("dark")).toBe("Current Visibility Mode: Dark");
    expect(formatVisibilityModeStatus("high-contrast")).toBe("Current Visibility Mode: High contrast");
  });

  it("applies the restored Visibility Mode to the dashboard document state", () => {
    persistVisibilityMode("high-contrast");
    const restoredMode = loadVisibilityMode();

    expect(applyVisibilityMode(restoredMode)).toBe("high-contrast");
    expect(document.documentElement.dataset.visibilityMode).toBe("high-contrast");
  });

  it("renders the persisted Visibility Mode across P2 dashboard surfaces", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    window.localStorage.setItem(VISIBILITY_MODE_STORAGE_KEY, "high-contrast");
    stubPublicFeedFetch();

    await import("../src/main");
    await waitForRenderedDashboard();

    const highContrastControl = document.querySelector<HTMLSelectElement>("[data-visibility-mode-control]");
    expect(document.documentElement.dataset.visibilityMode).toBe("high-contrast");
    expect(window.localStorage.getItem(VISIBILITY_MODE_STORAGE_KEY)).toBe("high-contrast");
    expect(highContrastControl?.value).toBe("high-contrast");
    expect(document.querySelector(".settings-control")?.textContent).toContain("Current Visibility Mode: High contrast");
    expect(document.querySelector(".settings-control")?.textContent).toContain(
      "Applies to navigation, cards, controls, Incident Detail, Saved Events View, AI Briefing, and Globe Map UI.",
    );
    expect(document.querySelector('[aria-label="Map area with styled Incident markers"]')?.textContent).toContain(
      "Select an Incident Marker or feed row to focus the Globe Map.",
    );
    expect(document.querySelector('[aria-labelledby="incident-detail-title"]')?.textContent).toContain("No selected Incident");
    expect(document.querySelector('[aria-labelledby="ai-briefing-title"]')?.textContent).toContain("Public-data AI Briefing");
    expect(document.querySelector('[aria-labelledby="saved-events-title"]')?.textContent).toContain("Saved Events View");

    highContrastControl!.value = "light";
    highContrastControl!.dispatchEvent(new Event("change", { bubbles: true }));

    const lightControl = document.querySelector<HTMLSelectElement>("[data-visibility-mode-control]");
    expect(document.documentElement.dataset.visibilityMode).toBe("light");
    expect(window.localStorage.getItem(VISIBILITY_MODE_STORAGE_KEY)).toBe("light");
    expect(lightControl?.value).toBe("light");
    expect(document.querySelector(".settings-control")?.textContent).toContain("Current Visibility Mode: Light");
    expect(document.querySelector('[aria-label="Map area with styled Incident markers"]')?.textContent).toContain(
      "Select an Incident Marker or feed row to focus the Globe Map.",
    );
    expect(document.querySelector('[aria-labelledby="incident-detail-title"]')?.textContent).toContain("No selected Incident");
    expect(document.querySelector('[aria-labelledby="ai-briefing-title"]')?.textContent).toContain("Public-data AI Briefing");
    expect(document.querySelector('[aria-labelledby="saved-events-title"]')?.textContent).toContain("Saved Events View");
  });
});
