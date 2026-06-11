import "./styles.css";
import {
  buildIncidentDetailDisplay,
  buildGlobalCrisisDashboardViewModel,
  findSelectedDashboardMapMarker,
  formatCategoryLabel,
  formatDashboardTimestamp,
  formatIncidentSeverityText,
  formatSourceStatusState,
  resolveSelectedIncidentId,
} from "./dashboard";
import {
  AiBriefingError,
  buildFilteredIncidentSetBriefingRequest,
  buildSingleIncidentBriefingRequest,
  generateAiBriefing,
  type AiBriefingOutput,
  type AiBriefingScope,
} from "./lib/ai-briefing";
import {
  fetchCombinedIncidentCollection,
  type CombinedIncidentCollection,
  type Incident,
  type IncidentCategory,
  type IncidentFilters,
  type PublicFeedId,
  type SeverityLabel,
} from "./lib/incidents";
import {
  buildSavedEventViewItems,
  isIncidentSaved,
  loadSavedEvents,
  removeSavedEvent,
  saveIncidentAsSavedEvent,
  type SavedEvent,
  type SavedEventViewItem,
} from "./lib/saved-events";
import {
  VISIBILITY_MODES,
  applyVisibilityMode,
  formatVisibilityModeLabel,
  formatVisibilityModeStatus,
  loadVisibilityMode,
  persistVisibilityMode,
  type VisibilityMode,
} from "./lib/visibility-mode";

interface DashboardState {
  collection: CombinedIncidentCollection | null;
  filters: IncidentFilters;
  selectedIncidentId: string | null;
  savedEvents: SavedEvent[];
  visibilityMode: VisibilityMode;
  aiBriefing: AiBriefingPanelState;
  isLoading: boolean;
  loadError: string | null;
}

interface AiBriefingPanelState {
  status: "idle" | "loading" | "ready" | "error";
  activeScope: AiBriefingScope | null;
  output: AiBriefingOutput | null;
  errorMessage: string | null;
}

type SavedEventToggleSurface = "feed" | "map" | "detail";
type SavedEventToggleAction = "save" | "unsave";
type SourceAttributionTone = "inline" | "map";

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (appRoot === null) {
  throw new Error("Global Crisis Observatory root element was not found.");
}

const dashboardRoot = appRoot;

const state: DashboardState = {
  collection: null,
  filters: {},
  selectedIncidentId: null,
  savedEvents: loadSavedEvents(),
  visibilityMode: loadVisibilityMode(),
  aiBriefing: {
    status: "idle",
    activeScope: null,
    output: null,
    errorMessage: null,
  },
  isLoading: true,
  loadError: null,
};

let aiBriefingRequestToken = 0;

applyVisibilityMode(state.visibilityMode);
render();
void refreshGlobalCrisisDashboard();

async function refreshGlobalCrisisDashboard(): Promise<void> {
  state.isLoading = true;
  state.loadError = null;
  render();

  try {
    const collectionOptions =
      state.collection === null ? {} : { previousSourceStatuses: state.collection.sourceStatuses };
    state.collection = await fetchCombinedIncidentCollection(collectionOptions);
  } catch (error) {
    state.collection = null;
    state.loadError = error instanceof Error ? error.message : "The incident pipeline could not be refreshed.";
  } finally {
    state.isLoading = false;
    render();
  }
}

function render(): void {
  if (state.collection === null) {
    dashboardRoot.innerHTML = renderInitialGlobalCrisisDashboard(state);
    bindGlobalCrisisDashboardActions();
    return;
  }

  const viewModel = buildGlobalCrisisDashboardViewModel(state.collection, state.filters);
  const selectedIncidentId = resolveSelectedIncidentId(viewModel.filteredIncidentSet, state.selectedIncidentId);
  state.selectedIncidentId = selectedIncidentId;
  const selectedIncident =
    selectedIncidentId === null ? null : viewModel.filteredIncidentSet.find((incident) => incident.id === selectedIncidentId) ?? null;
  const savedEventItems = buildSavedEventViewItems(state.savedEvents, viewModel.incidents);
  dashboardRoot.innerHTML = `
    <main class="dashboard-shell" aria-labelledby="dashboard-title">
      ${renderHeader(viewModel.refreshedAt, state.isLoading, viewModel.hasDegradedSourceStatus, state.visibilityMode)}
      ${renderMetrics(viewModel.metrics)}
      <section class="command-grid" aria-label="Global Crisis Dashboard layout">
        <section class="map-panel" aria-labelledby="map-title">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Globe Map</p>
              <h2 id="map-title">Primary geographic Incident view</h2>
              <p class="panel-subtitle">Incident Markers are projected by latitude and longitude with Public Feed attribution visible on the map.</p>
            </div>
          </div>
          ${renderMap(viewModel.mapMarkers, viewModel.hasFilteredIncidentSet, selectedIncident, state.savedEvents)}
        </section>
        <aside class="filters-panel" aria-labelledby="filters-title">
          <div class="panel-heading">
            <p class="eyebrow">Filters</p>
            <h2 id="filters-title">Refine the Filtered Incident Set</h2>
          </div>
          ${renderFilters(viewModel.filterOptions, state.filters)}
        </aside>
        <section class="feed-panel" aria-labelledby="feed-title">
          <div class="panel-heading">
            <p class="eyebrow">Incident Feed</p>
            <h2 id="feed-title">Live public Incidents</h2>
          </div>
          ${renderIncidentFeed(viewModel.filteredIncidentSet, viewModel.hasIncidents, selectedIncidentId, state.savedEvents)}
        </section>
        <div class="dashboard-side-stack">
          <aside class="detail-panel" aria-labelledby="incident-detail-title">
            ${renderIncidentDetail(selectedIncident, state.savedEvents)}
          </aside>
          <section class="ai-briefing-panel" aria-labelledby="ai-briefing-title">
            ${renderAiBriefingPanel(state.aiBriefing, selectedIncident, viewModel.filteredIncidentSet)}
          </section>
          <aside class="status-panel" aria-labelledby="source-status-title">
            <div class="panel-heading">
              <p class="eyebrow">Source Status</p>
              <h2 id="source-status-title">Public Feed freshness</h2>
            </div>
            ${renderSourceStatuses(viewModel.sourceStatuses)}
          </aside>
        </div>
        <section class="saved-events-panel" aria-labelledby="saved-events-title">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Saved Events</p>
              <h2 id="saved-events-title">Saved Events View</h2>
            </div>
            <span class="saved-events-count">${savedEventItems.length}</span>
          </div>
          ${renderSavedEventsView(savedEventItems)}
        </section>
      </section>
    </main>
  `;
  bindGlobalCrisisDashboardActions();
}

function renderInitialGlobalCrisisDashboard(dashboardState: DashboardState): string {
  const message = dashboardState.loadError === null ? "Loading public Incidents from the adapter pipeline." : dashboardState.loadError;
  const statusClass = dashboardState.loadError === null ? "loading-card" : "loading-card loading-card--error";

  return `
    <main class="dashboard-shell" aria-labelledby="dashboard-title">
      ${renderHeader(null, dashboardState.isLoading, dashboardState.loadError !== null, dashboardState.visibilityMode)}
      <section class="${statusClass}" role="status">
        <p class="eyebrow">Incident pipeline</p>
        <h2>${escapeHtml(dashboardState.loadError === null ? "Connecting to Public Feeds" : "Public Feed refresh failed")}</h2>
        <p>${escapeHtml(message)}</p>
        <button class="control-button" type="button" data-refresh>Refresh Source Status</button>
      </section>
    </main>
  `;
}

function renderHeader(
  refreshedAt: string | null,
  isLoading: boolean,
  hasDegradedSourceStatus: boolean,
  visibilityMode: VisibilityMode,
): string {
  const stateText = isLoading ? "Refreshing" : hasDegradedSourceStatus ? "Degraded" : "Operational";

  return `
    <header class="hero">
      <div>
        <p class="eyebrow">Global Crisis Dashboard</p>
        <h1 id="dashboard-title">Global Crisis Observatory</h1>
        <p class="hero-copy">A Global Crisis Dashboard view of normalized public natural-disaster and environmental Incidents.</p>
      </div>
      <div class="hero-status" data-state="${escapeHtml(stateText.toLowerCase())}">
        <span>${escapeHtml(stateText)}</span>
        <small>${escapeHtml(refreshedAt === null ? "Awaiting first refresh" : `Refreshed ${formatDashboardTimestamp(refreshedAt)} UTC`)}</small>
        <button class="control-button" type="button" data-refresh>${isLoading ? "Refreshing…" : "Refresh"}</button>
      </div>
      <section class="settings-control" aria-labelledby="settings-control-title" data-current-visibility-mode="${escapeHtml(visibilityMode)}">
        <p class="eyebrow" id="settings-control-title">Settings Control</p>
        <label for="visibility-mode">Visibility Mode</label>
        <select id="visibility-mode" name="visibility-mode" data-visibility-mode-control aria-describedby="visibility-mode-help">
          ${VISIBILITY_MODES.map(
            (mode) =>
              `<option value="${escapeHtml(mode)}" ${mode === visibilityMode ? "selected" : ""}>${escapeHtml(formatVisibilityModeLabel(mode))}</option>`,
          ).join("")}
        </select>
        <span class="visibility-mode-current" aria-live="polite">${escapeHtml(formatVisibilityModeStatus(visibilityMode))}</span>
        <small id="visibility-mode-help">Applies to navigation, cards, controls, Incident Detail, Saved Events View, AI Briefing, and Globe Map UI.</small>
      </section>
    </header>
  `;
}

function renderMetrics(metrics: Array<{ label: string; value: string; detail: string; tone: string }>): string {
  return `
    <section class="metrics-grid" aria-label="summary metrics">
      ${metrics
        .map(
          (metric) => `
            <article class="metric-card" data-tone="${escapeHtml(metric.tone)}">
              <span>${escapeHtml(metric.label)}</span>
              <strong>${escapeHtml(metric.value)}</strong>
              <p>${escapeHtml(metric.detail)}</p>
            </article>
          `,
        )
        .join("")}
    </section>
  `;
}

function renderMap(
  markers: ReturnType<typeof buildGlobalCrisisDashboardViewModel>["mapMarkers"],
  hasFilteredIncidentSet: boolean,
  selectedIncident: Incident | null,
  savedEvents: SavedEvent[],
): string {
  if (!hasFilteredIncidentSet) {
    return `
      <div class="map-canvas map-canvas--empty">
        <p>No Incidents match the current filters.</p>
      </div>
    `;
  }

  const selectedMarker = findSelectedDashboardMapMarker(markers, selectedIncident?.id ?? null);
  const mapFocusStyle =
    selectedMarker === null
      ? ""
      : ` style="--map-focus-x: ${selectedMarker.leftPercent.toFixed(2)}%; --map-focus-y: ${selectedMarker.topPercent.toFixed(2)}%;"`;
  const mapFocusClass = selectedMarker === null ? "" : " map-canvas--focused";
  const visibleSources = dedupeSourceAttributions(
    markers.map((marker) => ({ source: marker.source, sourceName: marker.sourceName })),
  );
  const mapNote =
    selectedIncident !== null && selectedIncident.coordinates === null
      ? `<p class="map-note">Selected Incident ${escapeHtml(selectedIncident.title)} has no coordinates to focus on.</p>`
      : selectedMarker !== null
        ? `<p class="map-note">Globe Map focused on ${escapeHtml(selectedMarker.title)}.</p>`
        : markers.length === 0
          ? `<p class="map-note">The Filtered Incident Set has no coordinates yet.</p>`
          : `<p class="map-note">Select an Incident Marker or feed row to focus the Globe Map.</p>`;

  return `
    <div class="map-canvas${mapFocusClass}" role="group" aria-label="Map area with styled Incident markers"${mapFocusStyle}>
      <div class="map-viewport">
        <div class="map-geography" aria-hidden="true">
          <span class="map-landmass map-landmass--north-america"></span>
          <span class="map-landmass map-landmass--south-america"></span>
          <span class="map-landmass map-landmass--europe-africa"></span>
          <span class="map-landmass map-landmass--asia"></span>
          <span class="map-landmass map-landmass--australia"></span>
          <span class="map-landmass map-landmass--antarctica"></span>
        </div>
        <div class="map-grid"></div>
        ${markers
          .map((marker) => {
            const isSelected = selectedIncident?.id === marker.id;
            const severity = marker.severityLabel ?? "unscored";

            return `
              <button
                class="map-marker map-marker--${escapeHtml(marker.category)} map-marker--severity-${escapeHtml(severity)}${isSelected ? " map-marker--selected" : ""}"
                type="button"
                style="left: ${marker.leftPercent.toFixed(2)}%; top: ${marker.topPercent.toFixed(2)}%;"
                title="${escapeHtml(`${marker.title} from ${marker.sourceName}`)}"
                aria-label="Select ${escapeHtml(marker.title)} from ${escapeHtml(marker.sourceName)}"
                aria-pressed="${isSelected ? "true" : "false"}"
                data-select-incident="${escapeHtml(marker.id)}"
                data-selection-surface="map"
                data-source="${escapeHtml(marker.source)}"
              >
                <span class="sr-only">${escapeHtml(marker.title)}</span>
                <span class="map-marker-source-abbr" aria-hidden="true">${escapeHtml(formatPublicFeedShortName(marker.source, marker.sourceName))}</span>
              </button>
            `;
          })
          .join("")}
      </div>
      <div class="map-source-legend" aria-label="Visible Public Feed attribution">
        <span class="map-source-legend__label">Visible Public Feeds</span>
        <div>
          ${
            visibleSources.length === 0
              ? `<span class="fallback-text">No geocoded Incidents</span>`
              : visibleSources.map((source) => renderSourceAttributionBadge(source.source, source.sourceName, "map")).join("")
          }
        </div>
      </div>
      ${mapNote}
      ${
        selectedIncident === null
          ? ""
          : `<div class="map-selection-actions" aria-label="Globe Map selected Incident Saved Event controls">
              ${renderSavedEventToggleControl(selectedIncident, isIncidentSaved(savedEvents, selectedIncident.id), "map")}
            </div>`
      }
    </div>
  `;
}

function renderFilters(filterOptions: ReturnType<typeof buildGlobalCrisisDashboardViewModel>["filterOptions"], filters: IncidentFilters): string {
  return `
    <form class="filters-form" data-filters>
      <label>
        Text search
        <input name="text" type="search" value="${escapeHtml(filters.text ?? "")}" placeholder="Search title or source" />
      </label>
      <label>
        Category
        <select name="category">
          <option value="">All categories</option>
          ${filterOptions.categories
            .map(
              (category) => `<option value="${escapeHtml(category)}" ${filters.categories?.includes(category) ? "selected" : ""}>${escapeHtml(formatCategoryLabel(category))}</option>`,
            )
            .join("")}
        </select>
      </label>
      <label>
        Public Feed
        <select name="source">
          <option value="">All Public Feeds</option>
          ${filterOptions.sources
            .map(
              (source) => `<option value="${escapeHtml(source.id)}" ${filters.sources?.includes(source.id) ? "selected" : ""}>${escapeHtml(source.name)}</option>`,
            )
            .join("")}
        </select>
      </label>
      <label>
        Severity Score
        <select name="severity">
          <option value="">All severities</option>
          ${filterOptions.severityLabels
            .map(
              (severityLabel) => `<option value="${escapeHtml(severityLabel)}" ${filters.severityLabels?.includes(severityLabel) ? "selected" : ""}>${escapeHtml(severityLabel)}</option>`,
            )
            .join("")}
        </select>
      </label>
      <button class="control-button control-button--secondary" type="button" data-reset-filters>Reset filters</button>
    </form>
  `;
}

function renderIncidentFeed(
  incidents: Incident[],
  hasIncidents: boolean,
  selectedIncidentId: string | null,
  savedEvents: SavedEvent[],
): string {
  if (!hasIncidents) {
    return `<div class="empty-state"><strong>No Incidents available.</strong><p>Reachable Public Feeds returned no normalized Incidents.</p></div>`;
  }

  if (incidents.length === 0) {
    return `<div class="empty-state"><strong>No matching Incidents.</strong><p>Adjust filters to expand the Filtered Incident Set.</p></div>`;
  }

  return `
    <div class="incident-list">
      ${incidents
        .map((incident) => renderIncidentCard(incident, incident.id === selectedIncidentId, isIncidentSaved(savedEvents, incident.id)))
        .join("")}
    </div>
  `;
}

function renderIncidentCard(incident: Incident, isSelected: boolean, isSaved: boolean): string {
  const severity = incident.severityLabel ?? "unscored";
  const coordinateText =
    incident.coordinates === null
      ? "Coordinates unavailable"
      : `${incident.coordinates.latitude.toFixed(2)}, ${incident.coordinates.longitude.toFixed(2)}`;

  return `
    <article
      id="incident-${escapeHtml(incident.id)}"
      class="incident-card incident-card--${escapeHtml(incident.category)} incident-card--severity-${escapeHtml(severity)}${isSelected ? " incident-card--selected" : ""}"
      data-incident-id="${escapeHtml(incident.id)}"
      aria-current="${isSelected ? "true" : "false"}"
    >
      <div>
        <button class="incident-select-button" type="button" data-select-incident="${escapeHtml(incident.id)}" data-selection-surface="feed">
          <span class="category-pill category-pill--${escapeHtml(incident.category)}">${escapeHtml(formatCategoryLabel(incident.category))}</span>
          <span class="severity-pill severity-pill--${escapeHtml(severity)}">${escapeHtml(severity)}${incident.severityScore === null ? "" : ` · ${incident.severityScore}`}</span>
          ${renderSourceAttributionBadge(incident.source, incident.sourceName)}
          <span class="incident-select-title">${escapeHtml(incident.title)}</span>
        </button>
      </div>
      <dl>
        <div><dt>Public Feed</dt><dd>${escapeHtml(incident.sourceName)}</dd></div>
        <div><dt>Severity Score</dt><dd>${escapeHtml(severity)}${incident.severityScore === null ? "" : ` · ${incident.severityScore}`}</dd></div>
        <div><dt>Started</dt><dd>${escapeHtml(formatDashboardTimestamp(incident.startedAt))}</dd></div>
        <div><dt>Coordinates</dt><dd>${escapeHtml(coordinateText)}</dd></div>
      </dl>
      <div class="incident-card-actions">
        ${renderSavedEventToggleControl(incident, isSaved, "feed")}
        ${incident.sourceUrl === null ? "" : `<a href="${escapeHtml(incident.sourceUrl)}" target="_blank" rel="noreferrer">Open source attribution</a>`}
      </div>
    </article>
  `;
}

export function renderIncidentDetail(incident: Incident | null, savedEvents: SavedEvent[]): string {
  if (incident === null) {
    return `
      <div class="panel-heading">
        <p class="eyebrow">Incident Detail</p>
        <h2 id="incident-detail-title">No selected Incident</h2>
      </div>
      <div class="empty-state">
        <strong>Select an Incident</strong>
        <p>Choose an Incident from the feed or map to inspect source-attributed details.</p>
      </div>
    `;
  }

  const severity = incident.severityLabel ?? "unscored";
  const detailDisplay = buildIncidentDetailDisplay(incident);
  const sourceLink =
    incident.sourceUrl === null
      ? `<span class="fallback-text">${escapeHtml(detailDisplay.sourceLinkText)}</span>`
      : `<a href="${escapeHtml(incident.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(detailDisplay.sourceLinkText)}</a>`;
  const metricFields = detailDisplay.metricFields;
  const isSaved = isIncidentSaved(savedEvents, incident.id);

  return `
    <div class="panel-heading">
      <p class="eyebrow">Incident Detail</p>
      <h2 id="incident-detail-title">Selected Incident</h2>
    </div>
    <article class="incident-detail-card incident-detail-card--${escapeHtml(incident.category)}" data-selected-incident-id="${escapeHtml(
      incident.id,
    )}">
      <div class="incident-detail-card__header">
        <span class="category-pill category-pill--${escapeHtml(incident.category)}">${escapeHtml(formatCategoryLabel(incident.category))}</span>
        <span class="severity-pill severity-pill--${escapeHtml(severity)}">${escapeHtml(formatIncidentSeverityText(incident))}</span>
        ${renderSourceAttributionBadge(incident.source, incident.sourceName)}
        <span class="saved-event-status">${formatSavedEventStateLabel(isSaved)}</span>
      </div>
      <h3>${escapeHtml(detailDisplay.title)}</h3>
      <dl class="incident-detail-grid">
        <div><dt>Public Feed</dt><dd>${escapeHtml(incident.sourceName)}</dd></div>
        <div><dt>Category</dt><dd>${escapeHtml(detailDisplay.categoryLabel)}</dd></div>
        <div><dt>Severity Score</dt><dd>${escapeHtml(detailDisplay.severityText)}</dd></div>
        <div><dt>Location</dt><dd>${escapeHtml(detailDisplay.locationText)}</dd></div>
        <div><dt>Started</dt><dd>${escapeHtml(detailDisplay.startedText)}</dd></div>
        <div><dt>Updated</dt><dd>${escapeHtml(detailDisplay.updatedText)}</dd></div>
        <div><dt>Source link</dt><dd>${sourceLink}</dd></div>
        <div><dt>Source record</dt><dd>${escapeHtml(detailDisplay.sourceRecordText)}</dd></div>
      </dl>
      <section class="incident-detail-metrics" aria-label="Event-specific metrics">
        <h4>Event-specific metrics</h4>
        ${
          metricFields.length === 0
            ? `<p class="fallback-text">${escapeHtml(detailDisplay.metricFallbackText ?? "")}</p>`
            : `<dl>${metricFields
                .map(
                  (metricField) =>
                    `<div><dt>${escapeHtml(metricField.label)}</dt><dd>${escapeHtml(metricField.value)} <span>from ${escapeHtml(
                      metricField.sourceName,
                    )}</span></dd></div>`,
                )
                .join("")}</dl>`
        }
      </section>
      <div class="incident-detail-actions">
        ${renderSavedEventToggleControl(incident, isSaved, "detail")}
      </div>
    </article>
  `;
}

function renderSourceStatuses(sourceStatuses: ReturnType<typeof buildGlobalCrisisDashboardViewModel>["sourceStatuses"]): string {
  return `
    <div class="source-status-list">
      ${sourceStatuses
        .map(
          (sourceStatus) => `
            <article class="source-status-card" data-state="${escapeHtml(sourceStatus.state)}">
              <div class="source-status-card__header">
                <strong>${escapeHtml(sourceStatus.publicFeedName)}</strong>
                <span>${escapeHtml(formatSourceStatusState(sourceStatus.state))}</span>
              </div>
              <p>${escapeHtml(sourceStatus.message ?? "Public Feed refreshed successfully.")}</p>
              <div class="source-status-card__timestamps">
                <small>Last attempted refresh: ${escapeHtml(formatDashboardTimestamp(sourceStatus.lastAttemptedAt))} UTC</small>
                <small>Latest successful refresh: ${escapeHtml(formatDashboardTimestamp(sourceStatus.lastSuccessfulAt))}${
                  sourceStatus.lastSuccessfulAt === null ? "" : " UTC"
                }</small>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderAiBriefingPanel(
  aiBriefing: AiBriefingPanelState,
  selectedIncident: Incident | null,
  filteredIncidentSet: Incident[],
): string {
  const singleIncidentDisabled = selectedIncident === null || aiBriefing.status === "loading";
  const filteredIncidentSetDisabled = filteredIncidentSet.length === 0 || aiBriefing.status === "loading";
  const activeScopeText =
    aiBriefing.activeScope === "single-incident"
      ? "selected Incident"
      : aiBriefing.activeScope === "filtered-incident-set"
        ? "Filtered Incident Set"
        : "no active request";

  return `
    <div class="panel-heading">
      <div>
        <p class="eyebrow">AI Briefing</p>
        <h2 id="ai-briefing-title">Public-data AI Briefing</h2>
      </div>
    </div>
    <div class="ai-briefing-controls" aria-label="AI Briefing request controls">
      <button class="control-button" type="button" data-request-ai-briefing="single-incident" ${singleIncidentDisabled ? "disabled" : ""}>
        Brief selected Incident
      </button>
      <button class="control-button control-button--secondary" type="button" data-request-ai-briefing="filtered-incident-set" ${filteredIncidentSetDisabled ? "disabled" : ""}>
        Brief Filtered Incident Set
      </button>
    </div>
    <p class="ai-briefing-privacy-note">
      Sends only public Incident fields from the dashboard. Do not enter PII, confidential context, or private operational data.
    </p>
    ${renderAiBriefingSourceContext(selectedIncident, filteredIncidentSet)}
    <div class="ai-briefing-status" role="status" aria-live="polite" data-state="${escapeHtml(aiBriefing.status)}">
      ${renderAiBriefingStatus(aiBriefing, activeScopeText)}
    </div>
  `;
}

function renderAiBriefingStatus(aiBriefing: AiBriefingPanelState, activeScopeText: string): string {
  if (aiBriefing.status === "loading") {
    return `<p>Requesting an AI Briefing for the ${escapeHtml(activeScopeText)}…</p>`;
  }

  if (aiBriefing.status === "error") {
    return `
      <div class="ai-briefing-error">
        <strong>AI Briefing unavailable</strong>
        <p>${escapeHtml(aiBriefing.errorMessage ?? "The AI Briefing request failed. The Global Crisis Dashboard remains interactive.")}</p>
      </div>
    `;
  }

  if (aiBriefing.status === "ready" && aiBriefing.output !== null) {
    return `
      <article class="ai-briefing-output">
        <section>
          <h3>Situation summary</h3>
          <p>${escapeHtml(aiBriefing.output.situationSummary)}</p>
        </section>
        <section>
          <h3>Likely impact considerations</h3>
          <p>${escapeHtml(aiBriefing.output.impactConsiderations)}</p>
        </section>
        <section>
          <h3>Response Priority Recommendation</h3>
          <p>${escapeHtml(aiBriefing.output.responsePriorityRecommendation)}</p>
        </section>
        <section>
          <h3>Uncertainty Note</h3>
          <ul>
            ${aiBriefing.output.uncertaintyNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
          </ul>
        </section>
      </article>
    `;
  }

  return `<p>Choose a selected Incident or the current Filtered Incident Set to generate an AI Briefing.</p>`;
}

function renderSavedEventsView(savedEventItems: SavedEventViewItem[]): string {
  if (savedEventItems.length === 0) {
    return `<div class="empty-state"><strong>No Saved Events yet.</strong><p>Saved Incidents will persist here in browser local storage across refreshes on this machine.</p></div>`;
  }

  return `
    <div class="saved-events-list">
      ${savedEventItems.map(renderSavedEventCard).join("")}
    </div>
  `;
}

function renderSavedEventCard(item: SavedEventViewItem): string {
  const savedEvent = item.savedEvent;
  const severity = savedEvent.severityLabel ?? "unscored";
  const coordinateText =
    savedEvent.coordinates === null
      ? "Coordinates unavailable"
      : `${savedEvent.coordinates.latitude.toFixed(2)}, ${savedEvent.coordinates.longitude.toFixed(2)}`;
  const sourceDetailText = [
    `Original source id: ${savedEvent.originalSourceId ?? "Unavailable"}`,
    `Source retrieved: ${formatDashboardTimestamp(savedEvent.sourceRetrievedAt)}`,
    `Saved: ${formatDashboardTimestamp(savedEvent.savedAt)}`,
  ].join(" · ");
  const revisitControl = item.isLive
    ? `<button class="control-button control-button--secondary" type="button" data-select-saved-event="${escapeHtml(savedEvent.id)}">Revisit live Incident</button>`
    : `<span class="saved-event-stale-note">Live Incident unavailable</span>`;

  return `
    <article
      class="saved-event-card incident-card--${escapeHtml(savedEvent.category)} incident-card--severity-${escapeHtml(severity)}"
      data-saved-event-id="${escapeHtml(savedEvent.id)}"
      data-state="${item.isLive ? "live" : "stale"}"
    >
      <div class="saved-event-card__header">
        <span class="category-pill category-pill--${escapeHtml(savedEvent.category)}">${escapeHtml(formatCategoryLabel(savedEvent.category))}</span>
        <span class="severity-pill severity-pill--${escapeHtml(severity)}">${escapeHtml(severity)}${savedEvent.severityScore === null ? "" : ` · ${savedEvent.severityScore}`}</span>
        ${renderSourceAttributionBadge(savedEvent.source, savedEvent.sourceName)}
        <span class="saved-event-status">${escapeHtml(item.statusText)}</span>
      </div>
      <h3>${escapeHtml(savedEvent.title)}</h3>
      <dl>
        <div><dt>Public Feed</dt><dd>${escapeHtml(savedEvent.sourceName)}</dd></div>
        <div><dt>Started</dt><dd>${escapeHtml(formatDashboardTimestamp(savedEvent.startedAt))}</dd></div>
        <div><dt>Updated</dt><dd>${escapeHtml(formatDashboardTimestamp(savedEvent.updatedAt))}</dd></div>
        <div><dt>Coordinates</dt><dd>${escapeHtml(coordinateText)}</dd></div>
      </dl>
      <p class="saved-event-source-detail">${escapeHtml(sourceDetailText)}</p>
      <div class="saved-event-actions">
        ${revisitControl}
        <button class="control-button control-button--secondary" type="button" data-remove-saved-event="${escapeHtml(savedEvent.id)}">Remove Saved Event</button>
        ${savedEvent.sourceUrl === null ? "" : `<a href="${escapeHtml(savedEvent.sourceUrl)}" target="_blank" rel="noreferrer">Open saved source attribution</a>`}
      </div>
    </article>
  `;
}

function renderSavedEventToggleControl(incident: Incident, isSaved: boolean, surface: SavedEventToggleSurface): string {
  const escapedIncidentId = escapeHtml(incident.id);
  const surfaceLabel = surface === "map" ? "Globe Map selection" : surface === "detail" ? "Incident Detail" : "feed";
  const toggleAction: SavedEventToggleAction = isSaved ? "unsave" : "save";
  const controlLabel = isSaved ? "Unsave Incident" : "Save Incident";
  const buttonClass = isSaved ? "control-button control-button--secondary" : "control-button";

  return `
    <div class="saved-event-toggle" data-saved-state="${isSaved ? "saved" : "unsaved"}" data-save-surface="${surface}">
      <span class="saved-event-status" aria-live="polite">${formatSavedEventStateLabel(isSaved)}</span>
      <button
        class="${buttonClass}"
        type="button"
        data-toggle-saved-event="${escapedIncidentId}"
        data-saved-event-action="${toggleAction}"
        data-save-surface="${surface}"
        aria-label="${escapeHtml(
          isSaved
            ? `Unsave ${incident.title} from ${surfaceLabel}`
            : `Save ${incident.title} from ${surfaceLabel} as a Saved Event`,
        )}"
      >
        ${controlLabel}
      </button>
    </div>
  `;
}

function formatSavedEventStateLabel(isSaved: boolean): string {
  return isSaved ? "Saved Event" : "Not saved";
}

function renderAiBriefingSourceContext(selectedIncident: Incident | null, filteredIncidentSet: Incident[]): string {
  const sourceAttributions =
    selectedIncident === null
      ? dedupeSourceAttributions(
          filteredIncidentSet.map((incident) => ({ source: incident.source, sourceName: incident.sourceName })),
        )
      : [{ source: selectedIncident.source, sourceName: selectedIncident.sourceName }];
  const detailText =
    selectedIncident === null
      ? `Filtered Incident Set includes ${filteredIncidentSet.length} public Incidents from ${sourceAttributions.length} Public Feeds.`
      : `Selected Incident source record: ${selectedIncident.rawSource.originalId ?? "unavailable"}.`;

  return `
    <div class="ai-briefing-source-context" aria-label="AI Briefing source attribution">
      <span>AI Briefing source context</span>
      <div>
        ${
          sourceAttributions.length === 0
            ? `<span class="fallback-text">No source-attributed Incidents available</span>`
            : sourceAttributions
                .map((sourceAttribution) =>
                  renderSourceAttributionBadge(sourceAttribution.source, sourceAttribution.sourceName),
                )
                .join("")
        }
      </div>
      <small>${escapeHtml(detailText)}</small>
    </div>
  `;
}

function renderSourceAttributionBadge(
  publicFeed: string,
  publicFeedName: string,
  tone: SourceAttributionTone = "inline",
): string {
  return `<span class="source-attribution source-attribution--${escapeHtml(
    formatSourceAttributionModifier(publicFeed),
  )} source-attribution--${tone}" title="${escapeHtml(`Public Feed: ${publicFeedName}`)}">
    <span class="source-attribution__abbr" aria-hidden="true">${escapeHtml(formatPublicFeedShortName(publicFeed, publicFeedName))}</span>
    <span class="source-attribution__name">${escapeHtml(publicFeedName)}</span>
  </span>`;
}

function dedupeSourceAttributions(
  sourceAttributions: Array<{ source: string; sourceName: string }>,
): Array<{ source: string; sourceName: string }> {
  const sourceNameBySource = new Map<string, string>();
  for (const sourceAttribution of sourceAttributions) {
    sourceNameBySource.set(sourceAttribution.source, sourceAttribution.sourceName);
  }

  return [...sourceNameBySource.entries()]
    .map(([source, sourceName]) => ({ source, sourceName }))
    .sort((left, right) => left.sourceName.localeCompare(right.sourceName));
}

function formatPublicFeedShortName(publicFeed: string, publicFeedName: string): string {
  switch (publicFeed) {
    case "usgs-earthquakes":
      return "USGS";
    case "nasa-eonet":
      return "EONET";
    case "gdacs":
      return "GDACS";
    default: {
      const acronym = publicFeedName
        .split(/\s+/u)
        .flatMap((part) => (part.length === 0 ? [] : [part[0]!.toUpperCase()]))
        .join("");
      return acronym.length === 0 ? "SRC" : acronym.slice(0, 6);
    }
  }
}

function formatSourceAttributionModifier(publicFeed: string): string {
  return publicFeed.toLowerCase().replace(/[^a-z0-9-]/gu, "-");
}

function bindGlobalCrisisDashboardActions(): void {
  dashboardRoot.querySelector<HTMLSelectElement>("[data-visibility-mode-control]")?.addEventListener("change", (event) => {
    const control = event.currentTarget;
    if (!(control instanceof HTMLSelectElement)) {
      return;
    }

    const selectedMode = control.value;
    if (!VISIBILITY_MODES.includes(selectedMode as VisibilityMode)) {
      return;
    }

    state.visibilityMode = persistVisibilityMode(selectedMode as VisibilityMode);
    applyVisibilityMode(state.visibilityMode);
    render();
  });

  dashboardRoot.querySelectorAll<HTMLButtonElement>("[data-refresh]").forEach((button) => {
    button.addEventListener("click", () => void refreshGlobalCrisisDashboard());
  });

  dashboardRoot.querySelector<HTMLButtonElement>("[data-reset-filters]")?.addEventListener("click", () => {
    state.filters = {};
    render();
  });

  dashboardRoot.querySelectorAll<HTMLButtonElement>("[data-select-incident]").forEach((button) => {
    button.addEventListener("click", () => {
      const selectedIncidentId = button.dataset.selectIncident ?? null;
      if (selectedIncidentId === null) {
        return;
      }

      state.selectedIncidentId = selectedIncidentId;
      const shouldScrollFeed = button.dataset.selectionSurface === "map";
      render();

      if (shouldScrollFeed) {
        scrollSelectedIncidentIntoView(selectedIncidentId);
      }
    });
  });

  dashboardRoot.querySelectorAll<HTMLButtonElement>("[data-select-saved-event]").forEach((button) => {
    button.addEventListener("click", () => {
      const selectedIncidentId = button.dataset.selectSavedEvent ?? null;
      if (selectedIncidentId === null) {
        return;
      }

      state.filters = {};
      state.selectedIncidentId = selectedIncidentId;
      render();
      scrollSelectedIncidentIntoView(selectedIncidentId);
    });
  });

  dashboardRoot.querySelectorAll<HTMLButtonElement>("[data-toggle-saved-event]").forEach((button) => {
    button.addEventListener("click", () => {
      const incidentId = button.dataset.toggleSavedEvent ?? null;
      const action = button.dataset.savedEventAction;
      if (incidentId === null || (action !== "save" && action !== "unsave")) {
        return;
      }

      if (toggleSavedEventForIncident(incidentId, action)) {
        render();
      }
    });
  });

  dashboardRoot.querySelectorAll<HTMLButtonElement>("[data-remove-saved-event]").forEach((button) => {
    button.addEventListener("click", () => {
      const savedEventId = button.dataset.removeSavedEvent ?? null;
      if (savedEventId === null) {
        return;
      }

      state.savedEvents = removeSavedEvent(savedEventId);
      render();
    });
  });

  dashboardRoot.querySelectorAll<HTMLButtonElement>("[data-request-ai-briefing]").forEach((button) => {
    button.addEventListener("click", () => {
      const scope = button.dataset.requestAiBriefing;
      if (scope !== "single-incident" && scope !== "filtered-incident-set") {
        return;
      }

      void requestAiBriefing(scope);
    });
  });

  dashboardRoot.querySelector<HTMLFormElement>("[data-filters]")?.addEventListener("input", (event) => {
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    state.filters = readDashboardFilters(form);
    render();
  });
}

async function requestAiBriefing(scope: AiBriefingScope): Promise<void> {
  if (state.collection === null) {
    return;
  }

  const viewModel = buildGlobalCrisisDashboardViewModel(state.collection, state.filters);
  const selectedIncidentId = resolveSelectedIncidentId(viewModel.filteredIncidentSet, state.selectedIncidentId);
  const selectedIncident =
    selectedIncidentId === null ? null : viewModel.filteredIncidentSet.find((incident) => incident.id === selectedIncidentId) ?? null;

  if (scope === "single-incident" && selectedIncident === null) {
    state.aiBriefing = {
      status: "error",
      activeScope: scope,
      output: null,
      errorMessage: "Select an Incident before requesting an AI Briefing for one Incident.",
    };
    render();
    return;
  }

  if (scope === "filtered-incident-set" && viewModel.filteredIncidentSet.length === 0) {
    state.aiBriefing = {
      status: "error",
      activeScope: scope,
      output: null,
      errorMessage: "The current Filtered Incident Set is empty. Adjust filters before requesting an AI Briefing.",
    };
    render();
    return;
  }

  const request =
    scope === "single-incident"
      ? buildSingleIncidentBriefingRequest(selectedIncident!)
      : buildFilteredIncidentSetBriefingRequest(viewModel.filteredIncidentSet, state.filters);
  const requestToken = ++aiBriefingRequestToken;
  state.aiBriefing = {
    status: "loading",
    activeScope: scope,
    output: null,
    errorMessage: null,
  };
  render();

  try {
    const output = await generateAiBriefing(request);
    if (requestToken !== aiBriefingRequestToken) {
      return;
    }

    state.aiBriefing = {
      status: "ready",
      activeScope: scope,
      output,
      errorMessage: null,
    };
  } catch (error) {
    if (requestToken !== aiBriefingRequestToken) {
      return;
    }

    state.aiBriefing = {
      status: "error",
      activeScope: scope,
      output: null,
      errorMessage: formatAiBriefingError(error),
    };
  } finally {
    if (requestToken === aiBriefingRequestToken) {
      render();
    }
  }
}

function findLiveIncidentById(incidentId: string): Incident | null {
  return state.collection?.incidents.find((incident) => incident.id === incidentId) ?? null;
}

function toggleSavedEventForIncident(incidentId: string, action: SavedEventToggleAction): boolean {
  if (action === "unsave") {
    state.savedEvents = removeSavedEvent(incidentId);
    return true;
  }

  const incident = findLiveIncidentById(incidentId);
  if (incident === null) {
    return false;
  }

  state.savedEvents = saveIncidentAsSavedEvent(incident);
  return true;
}

function scrollSelectedIncidentIntoView(selectedIncidentId: string): void {
  dashboardRoot.querySelector<HTMLElement>(`[data-incident-id="${cssEscape(selectedIncidentId)}"]`)?.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
  });
}

function readDashboardFilters(form: HTMLFormElement): IncidentFilters {
  const formData = new FormData(form);
  const filters: IncidentFilters = {};
  const text = readFormValue(formData, "text");
  const category = readFormValue(formData, "category");
  const source = readFormValue(formData, "source");
  const severity = readFormValue(formData, "severity");

  if (text !== "") {
    filters.text = text;
  }
  if (category !== "") {
    filters.categories = [category as IncidentCategory];
  }
  if (source !== "") {
    filters.sources = [source as PublicFeedId];
  }
  if (severity !== "") {
    filters.severityLabels = [severity as SeverityLabel];
  }

  return filters;
}

function readFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function formatAiBriefingError(error: unknown): string {
  if (error instanceof AiBriefingError) {
    return error.message;
  }

  return error instanceof Error
    ? `${error.message} The Global Crisis Dashboard remains interactive.`
    : "AI Briefing generation failed. The Global Crisis Dashboard remains interactive.";
}

function cssEscape(value: string): string {
  return globalThis.CSS?.escape(value) ?? value.replace(/["\\]/g, "\\$&");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return character;
    }
  });
}
