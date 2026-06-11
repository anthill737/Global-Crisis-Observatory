// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  AI_BRIEFING_CHOICE_STORAGE_KEY,
  formatAiBriefingChoiceStatus,
  formatAiBriefingProviderLabel,
  loadAiBriefingChoice,
  persistAiBriefingChoice,
} from "../src/lib/ai-briefing-choice";

afterEach(() => {
  window.localStorage.clear();
});

describe("AI Briefing Choice persistence", () => {
  it("prompts for a choice when browser storage is empty or unavailable", () => {
    expect(loadAiBriefingChoice(null)).toBeNull();
    expect(loadAiBriefingChoice()).toBeNull();
    expect(formatAiBriefingChoiceStatus(null)).toBe(
      "Choose an AI Briefing Provider to enable AI Briefings, or select Disabled to keep them off.",
    );
  });

  it("persists and restores OpenAI, Anthropic, Gemini, and Disabled choices", () => {
    expect(persistAiBriefingChoice("openai")).toBe("openai");
    expect(window.localStorage.getItem(AI_BRIEFING_CHOICE_STORAGE_KEY)).toBe("openai");
    expect(loadAiBriefingChoice()).toBe("openai");

    expect(persistAiBriefingChoice("anthropic")).toBe("anthropic");
    expect(window.localStorage.getItem(AI_BRIEFING_CHOICE_STORAGE_KEY)).toBe("anthropic");
    expect(loadAiBriefingChoice()).toBe("anthropic");

    expect(persistAiBriefingChoice("gemini")).toBe("gemini");
    expect(window.localStorage.getItem(AI_BRIEFING_CHOICE_STORAGE_KEY)).toBe("gemini");
    expect(loadAiBriefingChoice()).toBe("gemini");

    expect(persistAiBriefingChoice("disabled")).toBe("disabled");
    expect(window.localStorage.getItem(AI_BRIEFING_CHOICE_STORAGE_KEY)).toBe("disabled");
    expect(loadAiBriefingChoice()).toBe("disabled");
  });

  it("ignores unsupported stored values so first-visit prompting can recover", () => {
    window.localStorage.setItem(AI_BRIEFING_CHOICE_STORAGE_KEY, "local-model");

    expect(loadAiBriefingChoice()).toBeNull();
  });

  it("formats labels and status text for the Settings Control", () => {
    expect(formatAiBriefingProviderLabel("openai")).toBe("OpenAI");
    expect(formatAiBriefingProviderLabel("anthropic")).toBe("Anthropic");
    expect(formatAiBriefingProviderLabel("gemini")).toBe("Gemini");
    expect(formatAiBriefingProviderLabel("disabled")).toBe("Disabled");
    expect(formatAiBriefingChoiceStatus("openai")).toBe("AI Briefing Choice: OpenAI");
    expect(formatAiBriefingChoiceStatus("disabled")).toBe("AI Briefing Choice: Disabled — AI Briefings are off.");
  });
});
