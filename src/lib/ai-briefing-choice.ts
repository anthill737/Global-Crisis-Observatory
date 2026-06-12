export const AI_BRIEFING_CHOICE_STORAGE_KEY = "global-crisis-dashboard.aiBriefingChoice.v1";

export const AI_BRIEFING_PROVIDERS = ["openai", "anthropic", "gemini", "disabled"] as const;
export type AiBriefingProvider = (typeof AI_BRIEFING_PROVIDERS)[number];
export type AiBriefingChoice = AiBriefingProvider;

export interface AiBriefingChoiceStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function isAiBriefingChoice(value: unknown): value is AiBriefingChoice {
  return typeof value === "string" && AI_BRIEFING_PROVIDERS.includes(value as AiBriefingChoice);
}

export function loadAiBriefingChoice(storage: AiBriefingChoiceStorageAdapter | null = getBrowserLocalStorage()): AiBriefingChoice | null {
  if (storage === null) {
    return null;
  }

  try {
    const storedValue = storage.getItem(AI_BRIEFING_CHOICE_STORAGE_KEY);
    return isAiBriefingChoice(storedValue) ? storedValue : null;
  } catch {
    return null;
  }
}

export function persistAiBriefingChoice(
  aiBriefingChoice: AiBriefingChoice,
  storage: AiBriefingChoiceStorageAdapter | null = getBrowserLocalStorage(),
): AiBriefingChoice {
  const normalizedAiBriefingChoice = isAiBriefingChoice(aiBriefingChoice) ? aiBriefingChoice : "disabled";
  if (storage === null) {
    return normalizedAiBriefingChoice;
  }

  try {
    storage.setItem(AI_BRIEFING_CHOICE_STORAGE_KEY, normalizedAiBriefingChoice);
  } catch {
    return normalizedAiBriefingChoice;
  }

  return normalizedAiBriefingChoice;
}

export function formatAiBriefingProviderLabel(aiBriefingChoice: AiBriefingChoice): string {
  switch (aiBriefingChoice) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "gemini":
      return "Gemini";
    case "disabled":
      return "Disabled";
  }
}

export function formatAiBriefingChoiceStatus(aiBriefingChoice: AiBriefingChoice | null): string {
  if (aiBriefingChoice === null) {
    return "Choose an AI Briefing Provider to enable AI Briefings, or select Disabled to keep them off.";
  }

  if (aiBriefingChoice === "disabled") {
    return "AI Briefing Choice: Disabled — AI Briefings are off.";
  }

  return `AI Briefing Choice: ${formatAiBriefingProviderLabel(aiBriefingChoice)}`;
}

function getBrowserLocalStorage(): AiBriefingChoiceStorageAdapter | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}
