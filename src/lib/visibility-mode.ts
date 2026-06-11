export const VISIBILITY_MODE_STORAGE_KEY = "global-crisis-dashboard.visibilityMode.v1";

export const VISIBILITY_MODES = ["light", "dark", "high-contrast"] as const;
export type VisibilityMode = (typeof VISIBILITY_MODES)[number];

export interface VisibilityModeStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface VisibilityModeDocumentAdapter {
  documentElement: {
    dataset: {
      visibilityMode?: string;
    };
  };
}

export function isVisibilityMode(value: unknown): value is VisibilityMode {
  return typeof value === "string" && VISIBILITY_MODES.includes(value as VisibilityMode);
}

export function loadVisibilityMode(storage: VisibilityModeStorageAdapter | null = getBrowserLocalStorage()): VisibilityMode {
  if (storage === null) {
    return "dark";
  }

  try {
    const storedValue = storage.getItem(VISIBILITY_MODE_STORAGE_KEY);
    return isVisibilityMode(storedValue) ? storedValue : "dark";
  } catch {
    return "dark";
  }
}

export function persistVisibilityMode(
  visibilityMode: VisibilityMode,
  storage: VisibilityModeStorageAdapter | null = getBrowserLocalStorage(),
): VisibilityMode {
  const normalizedVisibilityMode = isVisibilityMode(visibilityMode) ? visibilityMode : "dark";
  if (storage === null) {
    return normalizedVisibilityMode;
  }

  try {
    storage.setItem(VISIBILITY_MODE_STORAGE_KEY, normalizedVisibilityMode);
  } catch {
    return normalizedVisibilityMode;
  }

  return normalizedVisibilityMode;
}

export function formatVisibilityModeLabel(visibilityMode: VisibilityMode): string {
  switch (visibilityMode) {
    case "light":
      return "Light";
    case "dark":
      return "Dark";
    case "high-contrast":
      return "High contrast";
  }
}

export function formatVisibilityModeStatus(visibilityMode: VisibilityMode): string {
  return `Current Visibility Mode: ${formatVisibilityModeLabel(visibilityMode)}`;
}

export function applyVisibilityMode(
  visibilityMode: VisibilityMode,
  documentAdapter: VisibilityModeDocumentAdapter | null = getBrowserDocument(),
): VisibilityMode {
  const normalizedVisibilityMode = isVisibilityMode(visibilityMode) ? visibilityMode : "dark";

  if (documentAdapter !== null) {
    documentAdapter.documentElement.dataset.visibilityMode = normalizedVisibilityMode;
  }

  return normalizedVisibilityMode;
}

function getBrowserLocalStorage(): VisibilityModeStorageAdapter | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function getBrowserDocument(): VisibilityModeDocumentAdapter | null {
  try {
    return typeof globalThis.document === "undefined" ? null : globalThis.document;
  } catch {
    return null;
  }
}
