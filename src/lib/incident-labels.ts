import type { Incident, IncidentCategory, SeverityLabel } from "./incidents";

export interface SourceReportedMeasurementField {
  label: string;
  value: string;
  sourceName: string;
}

const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  earthquake: "Earthquake",
  wildfire: "Wildfire",
  severe_storm: "Severe storm",
  volcano: "Volcano",
  flood: "Flood",
  sea_lake_ice: "Sea or lake ice",
  drought: "Drought",
  dust_haze: "Dust or haze",
  other: "Other Incident",
};

const SEVERITY_LABELS: Record<SeverityLabel, string> = {
  minor: "Minor",
  moderate: "Moderate",
  strong: "Strong",
  major: "Major",
};

export function formatIncidentCategoryLabel(category: IncidentCategory): string {
  return CATEGORY_LABELS[category];
}

export function formatSeverityLabel(severityLabel: SeverityLabel | null): string {
  return severityLabel === null ? "Unscored" : SEVERITY_LABELS[severityLabel];
}

export function formatIncidentSeverityScoreText(incident: Incident): string {
  if (incident.severityScore === null) {
    return "App Severity Score unavailable (normalized dashboard ranking, not a source-reported measurement)";
  }

  return `App Severity Score ${formatMetricNumber(incident.severityScore)}/100 (${formatSeverityLabel(
    incident.severityLabel,
  )} normalized dashboard ranking; not a source-reported measurement)`;
}

export function formatIncidentSeverityScoreCompactText(incident: Incident): string {
  if (incident.severityScore === null) {
    return "App score unavailable";
  }

  return `App score ${formatMetricNumber(incident.severityScore)}/100 · ${formatSeverityLabel(incident.severityLabel)}`;
}

export function buildSourceReportedMeasurementFields(incident: Incident): SourceReportedMeasurementField[] {
  switch (incident.source) {
    case "usgs-earthquakes":
      return buildUsgsEarthquakeMeasurements(incident);
    case "gdacs":
      return buildGdacsMeasurements(incident);
    case "noaa-nws-alerts":
      return buildNoaaNwsMeasurements(incident);
    case "nasa-eonet":
      return [];
  }
}

function buildUsgsEarthquakeMeasurements(incident: Incident): SourceReportedMeasurementField[] {
  const payload = incident.rawSource.payload;
  const magnitude = isRecord(payload) && isRecord(payload.properties) ? readFiniteNumber(payload.properties.mag) : null;

  if (magnitude === null) {
    return [];
  }

  return [
    {
      label: "USGS earthquake magnitude",
      value: `${formatMetricNumber(magnitude)} magnitude`,
      sourceName: incident.sourceName,
    },
  ];
}

function buildGdacsMeasurements(incident: Incident): SourceReportedMeasurementField[] {
  const payload = incident.rawSource.payload;
  if (!isRecord(payload)) {
    return [];
  }

  const alertLevel = readNonEmptyString(payload.alertLevel);
  if (alertLevel === null) {
    return [];
  }

  return [
    {
      label: "GDACS alert level",
      value: formatPlainLanguageValue(alertLevel),
      sourceName: incident.sourceName,
    },
  ];
}

function buildNoaaNwsMeasurements(incident: Incident): SourceReportedMeasurementField[] {
  const payload = incident.rawSource.payload;
  const properties = isRecord(payload) && isRecord(payload.properties) ? payload.properties : null;
  if (properties === null) {
    return [];
  }

  const sourceValues: Array<[string, string | null]> = [
    ["NOAA/NWS source severity", readNonEmptyString(properties.severity)],
    ["NOAA/NWS urgency", readNonEmptyString(properties.urgency)],
    ["NOAA/NWS certainty", readNonEmptyString(properties.certainty)],
  ];

  return sourceValues.flatMap(([label, value]) =>
    value === null
      ? []
      : [
          {
            label,
            value: formatPlainLanguageValue(value),
            sourceName: incident.sourceName,
          },
        ],
  );
}

function formatPlainLanguageValue(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (match) => match.toUpperCase());
}

function formatMetricNumber(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
