import "./styles.css";
import {
  buildIncidentDetailDisplay,
  buildGlobalCrisisDashboardViewModel,
  createIdleAreaSearchResolution,
  focusGlobeViewOnDashboardMapMarker,
  focusGlobeViewOnAreaSearchArea,
  normalizeDashboardGlobeView,
  findSelectedDashboardMapMarker,
  formatCategoryLabel,
  formatDashboardTimestamp,
  formatIncidentSeverityText,
  formatSourceStatusState,
  resolveDashboardMapMarkerIncidentIds,
  resolveAreaSearchQuery,
  resolveSelectedIncidentId,
  type AreaSearchResolution,
  type DashboardGlobeView,
  type DashboardMapMarker,
} from "./dashboard";
import {
  AiBriefingError,
  buildFilteredIncidentSetBriefingRequest,
  buildSingleIncidentBriefingRequest,
  buildSelectedIncidentPublicSocialContext,
  generateAiBriefing,
  type AiBriefingOutput,
  type AiBriefingScope,
  type PublicSocialContext,
} from "./lib/ai-briefing";
import {
  AI_BRIEFING_PROVIDERS,
  formatAiBriefingChoiceStatus,
  formatAiBriefingProviderLabel,
  isAiBriefingChoice,
  loadAiBriefingChoice,
  persistAiBriefingChoice,
  type AiBriefingChoice,
} from "./lib/ai-briefing-choice";
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
  buildSourceReportedMeasurementFields,
  formatIncidentSeverityScoreCompactText,
  formatSeverityLabel,
  type SourceReportedMeasurementField,
} from "./lib/incident-labels";
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
  OPEN_EARTH_GEOGRAPHY_FEATURES,
  OPEN_EARTH_GEOGRAPHY_SOURCE,
  type GlobeCoordinate,
  type GlobeGeographyFeature,
} from "./lib/open-earth-geography";
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
  aggregateMarkerDrillDown: AggregateMarkerDrillDownSelection | null;
  savedEvents: SavedEvent[];
  visibilityMode: VisibilityMode;
  aiBriefingChoice: AiBriefingChoice | null;
  settingsControlOpen: boolean;
  globeView: DashboardGlobeView;
  areaSearch: AreaSearchResolution;
  aiBriefing: AiBriefingPanelState;
  isLoading: boolean;
  loadError: string | null;
}

interface AiBriefingPanelState {
  status: "idle" | "loading" | "ready" | "error";
  activeScope: AiBriefingScope | null;
  incidentId: string | null;
  output: AiBriefingOutput | null;
  errorMessage: string | null;
  publicSocialContext: PublicSocialContext | null;
  publicSocialContextLimitation: string | null;
}

interface AggregateMarkerDrillDownSelection {
  title: string;
  incidentIds: string[];
}

interface AggregateMarkerDrillDownResolution {
  selection: AggregateMarkerDrillDownSelection | null;
  activeIncidentIds: string[];
  missingIncidentIds: string[];
}

type SavedEventToggleSurface = "feed" | "map" | "detail";
type SavedEventToggleAction = "save" | "unsave";
type SourceAttributionTone = "inline" | "map";

interface ProjectedGlobeCoordinate {
  x: number;
  y: number;
  depth: number;
  isVisible: boolean;
}

interface GlobeDragState {
  isDragging: boolean;
  hasMoved: boolean;
  pointerId: number | null;
  lastClientX: number;
  lastClientY: number;
  lastTimestamp: number;
  velocityLongitude: number;
  velocityLatitude: number;
  inertiaFrame: number | null;
  pendingRenderFrame: number | null;
  inertiaRunId: number;
}

const GLOBE_GEOGRAPHY_RADIUS_PERCENT = 45.5;
const GLOBE_GEOGRAPHY_HORIZON_DEPTH = -0.08;
const GLOBE_DRAG_LONGITUDE_DEGREES_PER_PIXEL = 0.24;
const GLOBE_DRAG_LATITUDE_DEGREES_PER_PIXEL = 0.16;
const GLOBE_DRAG_CLICK_SUPPRESSION_PIXELS = 6;
const GLOBE_DRAG_MINIMUM_TIME_DELTA_MS = 8;
const GLOBE_DRAG_MAXIMUM_VELOCITY_DEGREES_PER_FRAME = 4.8;
const GLOBE_INERTIA_DECAY = 0.88;
const GLOBE_INERTIA_MINIMUM_DEGREES_PER_FRAME = 0.035;
const SELECTED_INCIDENT_FOCUS_ZOOM_STEP = 0.18;

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (appRoot === null) {
  throw new Error("Global Crisis Observatory root element was not found.");
}

const dashboardRoot = appRoot;

const state: DashboardState = {
  collection: null,
  filters: {},
  selectedIncidentId: null,
  aggregateMarkerDrillDown: null,
  savedEvents: loadSavedEvents(),
  visibilityMode: loadVisibilityMode(),
  aiBriefingChoice: loadAiBriefingChoice(),
  settingsControlOpen: false,
  globeView: {
    rotationLongitude: -105,
    rotationLatitude: 18,
    zoom: 1,
  },
  areaSearch: createIdleAreaSearchResolution(),
  aiBriefing: {
    status: "idle",
    activeScope: null,
    incidentId: null,
    output: null,
    errorMessage: null,
    publicSocialContext: null,
    publicSocialContextLimitation: null,
  },
  isLoading: true,
  loadError: null,
};

let aiBriefingRequestToken = 0;
let suppressNextGlobeClick = false;
const globeDragState: GlobeDragState = {
  isDragging: false,
  hasMoved: false,
  pointerId: null,
  lastClientX: 0,
  lastClientY: 0,
  lastTimestamp: 0,
  velocityLongitude: 0,
  velocityLatitude: 0,
  inertiaFrame: null,
  pendingRenderFrame: null,
  inertiaRunId: 0,
};

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
    if (state.areaSearch.status !== "idle") {
      state.areaSearch = resolveAreaSearchQuery(state.areaSearch.query, state.collection.incidents);
    }
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

  const viewModel = buildGlobalCrisisDashboardViewModel(state.collection, state.filters, state.globeView);
  const aggregateMarkerDrillDown = resolveAggregateMarkerDrillDownSelection(
    state.aggregateMarkerDrillDown,
    viewModel.filteredIncidentSet,
  );
  const selectedIncidentId = resolveSelectedIncidentAfterAggregateDrillDown(
    viewModel.filteredIncidentSet,
    state.selectedIncidentId,
    aggregateMarkerDrillDown,
  );
  state.selectedIncidentId = selectedIncidentId;
  resetSingleIncidentAiBriefingIfStale(selectedIncidentId);
  const selectedIncident =
    selectedIncidentId === null ? null : viewModel.filteredIncidentSet.find((incident) => incident.id === selectedIncidentId) ?? null;
  const savedEventItems = buildSavedEventViewItems(state.savedEvents, viewModel.incidents);
  dashboardRoot.innerHTML = `
    <main class="dashboard-shell" aria-labelledby="dashboard-title">
      ${renderHeader(
        viewModel.refreshedAt,
        state.isLoading,
        viewModel.hasDegradedSourceStatus,
        state.visibilityMode,
        state.aiBriefingChoice,
        state.settingsControlOpen,
      )}
      ${renderMetrics(viewModel.metrics)}
      <section class="command-grid" aria-label="Global Crisis Dashboard compact operations layout" data-dashboard-layout="compact-operations">
        <section class="map-panel" aria-labelledby="map-title">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Globe Map</p>
              <h2 id="map-title">Primary geographic Incident view</h2>
              <p class="panel-subtitle">Incident Markers are projected onto a spherical Globe Map with rotation, zoom, and Public Feed attribution visible on the surface.</p>
            </div>
          </div>
          ${renderMap(
            viewModel.mapMarkers,
            viewModel.hasFilteredIncidentSet,
            selectedIncident,
            state.savedEvents,
            state.globeView,
            state.areaSearch,
            aggregateMarkerDrillDown,
          )}
          ${renderAreaSearch(state.areaSearch)}
        </section>
        <aside class="filters-panel" aria-labelledby="filters-title">
          <div class="panel-heading">
            <p class="eyebrow">Filters</p>
            <h2 id="filters-title">Refine the Filtered Incident Set</h2>
          </div>
          ${renderFilters(viewModel.filterOptions, state.filters)}
        </aside>
        <aside class="status-panel" aria-labelledby="source-status-title">
          <div class="panel-heading">
            <p class="eyebrow">Source Status</p>
            <h2 id="source-status-title">Public Feed freshness</h2>
          </div>
          ${renderSourceStatuses(viewModel.sourceStatuses)}
        </aside>
        <section class="feed-panel operations-panel" aria-labelledby="feed-title">
          <div class="panel-heading">
            <p class="eyebrow">Incident Feed</p>
            <h2 id="feed-title">Live public Incidents</h2>
          </div>
          ${renderIncidentFeed(
            viewModel.filteredIncidentSet,
            viewModel.hasIncidents,
            selectedIncidentId,
            state.savedEvents,
            state.areaSearch,
            aggregateMarkerDrillDown,
          )}
        </section>
        <section class="incident-analysis-dock operations-panel" aria-label="Selected Incident analysis">
          <aside class="detail-panel" aria-labelledby="incident-detail-title">
            ${renderIncidentDetail(selectedIncident, state.savedEvents)}
          </aside>
          <section class="ai-briefing-panel" aria-labelledby="ai-briefing-title">
            ${renderAiBriefingPanel(state.aiBriefing, selectedIncident, viewModel.filteredIncidentSet, state.aiBriefingChoice)}
          </section>
        </section>
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
      ${renderHeader(
        null,
        dashboardState.isLoading,
        dashboardState.loadError !== null,
        dashboardState.visibilityMode,
        dashboardState.aiBriefingChoice,
        dashboardState.settingsControlOpen,
      )}
      <section class="${statusClass}" role="status">
        <p class="eyebrow">Incident pipeline</p>
        <h2>${escapeHtml(dashboardState.loadError === null ? "Connecting to Public Feeds" : "Public Feed refresh failed")}</h2>
        <p>${escapeHtml(message)}</p>
        <button class="control-button" type="button" data-refresh>Refresh Source Status</button>
      </section>
    </main>
  `;
}

function resolveAggregateMarkerDrillDownSelection(
  selection: AggregateMarkerDrillDownSelection | null,
  filteredIncidentSet: Incident[],
): AggregateMarkerDrillDownResolution {
  if (selection === null) {
    return { selection: null, activeIncidentIds: [], missingIncidentIds: [] };
  }

  const filteredIncidentIds = new Set(filteredIncidentSet.map((incident) => incident.id));
  const activeIncidentIds = selection.incidentIds.filter((incidentId) => filteredIncidentIds.has(incidentId));

  return {
    selection,
    activeIncidentIds,
    missingIncidentIds: selection.incidentIds.filter((incidentId) => !filteredIncidentIds.has(incidentId)),
  };
}

function resolveSelectedIncidentAfterAggregateDrillDown(
  filteredIncidentSet: Incident[],
  selectedIncidentId: string | null,
  aggregateMarkerDrillDown: AggregateMarkerDrillDownResolution,
): string | null {
  const resolvedSelectedIncidentId = resolveSelectedIncidentId(filteredIncidentSet, selectedIncidentId);
  if (aggregateMarkerDrillDown.selection === null || aggregateMarkerDrillDown.activeIncidentIds.length === 0) {
    return resolvedSelectedIncidentId;
  }

  if (resolvedSelectedIncidentId !== null && aggregateMarkerDrillDown.activeIncidentIds.includes(resolvedSelectedIncidentId)) {
    return resolvedSelectedIncidentId;
  }

  const activeIncidentIds = new Set(aggregateMarkerDrillDown.activeIncidentIds);
  return filteredIncidentSet.find((incident) => activeIncidentIds.has(incident.id))?.id ?? null;
}

function renderHeader(
  refreshedAt: string | null,
  isLoading: boolean,
  hasDegradedSourceStatus: boolean,
  visibilityMode: VisibilityMode,
  aiBriefingChoice: AiBriefingChoice | null,
  settingsControlOpen: boolean,
): string {
  const stateText = isLoading ? "Refreshing" : hasDegradedSourceStatus ? "Degraded" : "Operational";
  const settingsPanelId = "settings-control-panel";
  const settingsToggleText = settingsControlOpen ? "Close Settings Control" : "Settings Control";

  return `
    <header class="hero">
      <div class="hero__identity">
        <p class="eyebrow">Global Crisis Dashboard</p>
        <h1 id="dashboard-title">Global Crisis Observatory</h1>
        <p class="hero-copy">A Global Crisis Dashboard view of normalized public natural-disaster and environmental Incidents.</p>
      </div>
      <div class="hero-status" data-state="${escapeHtml(stateText.toLowerCase())}">
        <span>${escapeHtml(stateText)}</span>
        <small>${escapeHtml(refreshedAt === null ? "Awaiting first refresh" : `Refreshed ${formatDashboardTimestamp(refreshedAt)} UTC`)}</small>
        <button class="control-button" type="button" data-refresh>${isLoading ? "Refreshing…" : "Refresh"}</button>
      </div>
      <section class="settings-control" aria-labelledby="settings-control-title" data-settings-control data-settings-control-open="${settingsControlOpen ? "true" : "false"}" data-current-visibility-mode="${escapeHtml(visibilityMode)}" data-current-ai-briefing-choice="${escapeHtml(aiBriefingChoice ?? "unselected")}">
        <div class="settings-control__summary">
          <p class="eyebrow" id="settings-control-title">Settings Control</p>
          <p class="settings-control__snapshot">${escapeHtml(formatVisibilityModeStatus(visibilityMode))} · ${escapeHtml(formatAiBriefingChoiceStatus(aiBriefingChoice))}</p>
          <small>Visibility Mode and AI Briefing Choice live here so operations panels stay focused on Incidents.</small>
        </div>
        <button class="control-button settings-control__toggle" type="button" data-settings-control-toggle aria-expanded="${settingsControlOpen ? "true" : "false"}" aria-controls="${settingsPanelId}">
          ${escapeHtml(settingsToggleText)}
        </button>
        ${
          settingsControlOpen
            ? `
              <div class="settings-control__panel" id="${settingsPanelId}" role="dialog" aria-modal="false" aria-labelledby="settings-control-title">
                <div class="settings-control__field">
                  <label for="visibility-mode">Visibility Mode</label>
                  <select id="visibility-mode" name="visibility-mode" data-visibility-mode-control aria-describedby="visibility-mode-help">
                    ${VISIBILITY_MODES.map(
                      (mode) =>
                        `<option value="${escapeHtml(mode)}" ${mode === visibilityMode ? "selected" : ""}>${escapeHtml(formatVisibilityModeLabel(mode))}</option>`,
                    ).join("")}
                  </select>
                  <span class="visibility-mode-current" aria-live="polite">${escapeHtml(formatVisibilityModeStatus(visibilityMode))}</span>
                  <small id="visibility-mode-help">Applies to navigation, cards, controls, Incident Detail, Saved Events View, AI Briefing, and Globe Map UI.</small>
                </div>
                <div class="settings-control__field settings-control__field--ai-briefing">
                  <label for="ai-briefing-choice">AI Briefing Choice</label>
                  <select id="ai-briefing-choice" name="ai-briefing-choice" data-ai-briefing-choice-control aria-describedby="ai-briefing-choice-help ai-briefing-key-guidance">
                    <option value="" ${aiBriefingChoice === null ? "selected" : ""} disabled>Choose an AI Briefing Provider</option>
                    ${AI_BRIEFING_PROVIDERS.map(
                      (choice) =>
                        `<option value="${escapeHtml(choice)}" ${choice === aiBriefingChoice ? "selected" : ""}>${escapeHtml(formatAiBriefingProviderLabel(choice))}</option>`,
                    ).join("")}
                  </select>
                  <span class="ai-briefing-choice-current" aria-live="polite">${escapeHtml(formatAiBriefingChoiceStatus(aiBriefingChoice))}</span>
                  <small id="ai-briefing-choice-help">Choose OpenAI, Anthropic, Gemini, or Disabled. The choice is saved locally on this device and can be changed later from this Settings Control.</small>
                  ${
                    aiBriefingChoice === null
                      ? `<p class="ai-briefing-choice-prompt" data-ai-briefing-choice-prompt>Welcome — choose an AI Briefing Provider to use AI Briefings, or select Disabled to keep them off for this browser.</p>`
                      : ""
                  }
                </div>
                <div class="settings-control__guidance" id="ai-briefing-key-guidance" data-ai-briefing-key-guidance>
                  <strong>Local AI Briefing Provider keys</strong>
                  <p>Configure keys in your local environment or .env.local before starting Vite: OPENAI_API_KEY for OpenAI, ANTHROPIC_API_KEY for Anthropic, or GEMINI_API_KEY for Gemini.</p>
                  <p>The browser sends only the selected AI Briefing Choice to the local /api/ai-briefing route; provider keys stay server-side. Select Disabled if you do not want AI Briefings.</p>
                </div>
              </div>
            `
            : ""
        }
      </section>
    </header>
  `;
}

function renderMetrics(metrics: Array<{ label: string; value: string; detail: string; tone: string }>): string {
  return `
    <section class="metrics-panel" aria-labelledby="summary-metrics-title">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Summary metrics</p>
          <h2 id="summary-metrics-title">Operational overview</h2>
        </div>
        <p class="panel-subtitle">Compact counts and Source Status signals for the current Global Crisis Dashboard refresh.</p>
      </div>
      <div class="metrics-grid">
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
      </div>
    </section>
  `;
}

function renderAreaSearch(areaSearch: AreaSearchResolution): string {
  const query = areaSearch.status === "idle" ? "" : areaSearch.query;
  const statusClass = `area-search-status area-search-status--${areaSearch.status}`;
  const resultMarkup =
    areaSearch.status === "success"
      ? renderAreaSearchSuccess(areaSearch)
      : areaSearch.status === "ambiguous"
        ? renderAreaSearchAmbiguous(areaSearch)
        : "";

  return `
    <section class="area-search" aria-labelledby="area-search-title" data-area-search-state="${escapeHtml(areaSearch.status)}">
      <div class="area-search__heading">
        <div>
          <p class="eyebrow">Area Search</p>
          <h3 id="area-search-title">Focus place or region</h3>
        </div>
        <span class="area-search__mode">Globe Map focus</span>
      </div>
      <form class="area-search-form" data-area-search-form>
        <label for="area-search-query">Place or region query</label>
        <div class="area-search-form__controls">
          <input
            id="area-search-query"
            name="areaSearchQuery"
            type="search"
            value="${escapeHtml(query)}"
            placeholder="Try Anchorage, British Columbia, or 61.2, -149.9"
            autocomplete="off"
            aria-describedby="area-search-status"
            data-area-search-query
          />
          <button class="control-button" type="submit">Search area</button>
          <button class="control-button control-button--secondary" type="button" data-clear-area-search>Clear</button>
        </div>
      </form>
      <div id="area-search-status" class="${statusClass}" role="status" aria-live="polite">
        <p>${escapeHtml(areaSearch.message)}</p>
        ${resultMarkup}
      </div>
    </section>
  `;
}

function renderAreaSearchSuccess(areaSearch: Extract<AreaSearchResolution, { status: "success" }>): string {
  const nearbyIncidents = areaSearch.nearbyIncidents.slice(0, 4);

  return `
    <div class="area-search-result" data-area-search-result="${escapeHtml(areaSearch.area.id)}">
      <span>${escapeHtml(areaSearch.area.label)}</span>
      <small>Center ${areaSearch.area.center.latitude.toFixed(2)}°, ${areaSearch.area.center.longitude.toFixed(2)}° · ${areaSearch.area.radiusKm} km radius</small>
      ${
        nearbyIncidents.length === 0
          ? `<small>No nearby Incidents to emphasize in the current Filtered Incident Set.</small>`
          : `<ol class="area-search-nearby-list">${nearbyIncidents
              .map(
                (nearbyIncident) =>
                  `<li><button type="button" data-select-incident="${escapeHtml(nearbyIncident.incident.id)}" data-selection-surface="area-search">${escapeHtml(
                    nearbyIncident.incident.title,
                  )}</button><span>${nearbyIncident.distanceKm.toFixed(1)} km</span></li>`,
              )
              .join("")}</ol>`
      }
    </div>
  `;
}

function renderAreaSearchAmbiguous(areaSearch: Extract<AreaSearchResolution, { status: "ambiguous" }>): string {
  return `
    <div class="area-search-candidates" aria-label="Ambiguous Area Search matches">
      ${areaSearch.candidates
        .map(
          (candidate) => `
            <button
              class="control-button control-button--secondary"
              type="button"
              data-select-area-search-candidate="${escapeHtml(candidate.id)}"
            >
              ${escapeHtml(candidate.label)}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderMap(
  markers: ReturnType<typeof buildGlobalCrisisDashboardViewModel>["mapMarkers"],
  hasFilteredIncidentSet: boolean,
  selectedIncident: Incident | null,
  savedEvents: SavedEvent[],
  globeView: DashboardGlobeView,
  areaSearch: AreaSearchResolution,
  aggregateMarkerDrillDown: AggregateMarkerDrillDownResolution,
): string {
  if (!hasFilteredIncidentSet) {
    return `
      <div class="map-canvas map-canvas--empty">
        <p>No Incidents match the current filters.</p>
      </div>
    `;
  }

  const selectedMarker = findSelectedDashboardMapMarker(markers, selectedIncident?.id ?? null);
  const selectedIncidentId = selectedIncident?.id ?? null;
  const renderedMarkers = markers.filter(
    (marker) =>
      marker.isVisible || marker.id === selectedIncidentId || (selectedIncidentId !== null && marker.incidentIds.includes(selectedIncidentId)),
  );
  const mapFocusStyle =
    selectedMarker === null
      ? ""
      : ` style="--map-focus-x: ${selectedMarker.leftPercent.toFixed(2)}%; --map-focus-y: ${selectedMarker.topPercent.toFixed(2)}%;"`;
  const mapFocusClass = selectedMarker === null ? "" : " map-canvas--focused";
  const visibleSources = dedupeSourceAttributions(
    renderedMarkers.map((marker) => ({ source: marker.source, sourceName: marker.sourceName })),
  );
  const areaSearchNearbyIncidentIds =
    areaSearch.status === "success" ? new Set(areaSearch.nearbyIncidents.map((nearbyIncident) => nearbyIncident.incident.id)) : new Set<string>();
  const aggregateDrillDownSelection = aggregateMarkerDrillDown.selection;
  const aggregateDrillDownIncidentIds = new Set(aggregateMarkerDrillDown.activeIncidentIds);
  const hasAggregateDrillDown = aggregateDrillDownSelection !== null;
  const hasStaleAggregateDrillDown =
    aggregateDrillDownSelection !== null && aggregateMarkerDrillDown.activeIncidentIds.length === 0;
  const hasChangedAggregateDrillDown =
    aggregateDrillDownSelection !== null &&
    aggregateMarkerDrillDown.activeIncidentIds.length > 0 &&
    aggregateMarkerDrillDown.missingIncidentIds.length > 0;
  const aggregateDrillDownTitle = aggregateDrillDownSelection?.title ?? "the selected aggregated Incident Marker";
  const mapNote =
    hasStaleAggregateDrillDown
      ? `<p class="map-note map-note--changed" data-aggregate-drill-down-state="changed">The localized Incident set changed; none of the Incidents from ${escapeHtml(
          aggregateDrillDownTitle,
        )} remain in the current Filtered Incident Set.</p>`
      : hasChangedAggregateDrillDown
        ? `<p class="map-note" data-aggregate-drill-down-state="partial">Localized Incident set updated for ${escapeHtml(
            aggregateDrillDownTitle,
          )}; ${aggregateMarkerDrillDown.activeIncidentIds.length} Incidents still match the current filters.</p>`
        : hasAggregateDrillDown
          ? `<p class="map-note" data-aggregate-drill-down-state="active">Globe Map focused on localized Incidents from ${escapeHtml(
              aggregateDrillDownTitle,
            )}.</p>`
          : selectedIncident !== null && selectedIncident.coordinates === null
      ? `<p class="map-note">Selected Incident ${escapeHtml(selectedIncident.title)} has no coordinates to focus on.</p>`
      : selectedMarker !== null
        ? `<p class="map-note">Globe Map focused on ${escapeHtml(selectedMarker.title)}.</p>`
        : markers.length === 0
          ? `<p class="map-note">The Filtered Incident Set has no coordinates yet.</p>`
          : renderedMarkers.length === 0
            ? `<p class="map-note">Spin the Globe Map to bring far-side Incident Markers into view.</p>`
            : `<p class="map-note">Select an Incident Marker or feed row to focus the Globe Map.</p>`;

  const normalizedGlobeView = normalizeDashboardGlobeView(globeView);

  return `
    <div class="map-canvas${mapFocusClass}" role="group" aria-label="Spherical Globe Map with styled Incident Markers" data-globe-interaction="drag-spin-zoom-focus"${mapFocusStyle}>
      <div class="globe-controls" aria-label="Globe Map rotation and zoom controls">
        <button class="globe-control" type="button" data-globe-control="spin-west" aria-label="Spin Globe Map west">◀</button>
        <button class="globe-control" type="button" data-globe-control="spin-east" aria-label="Spin Globe Map east">▶</button>
        <button class="globe-control" type="button" data-globe-control="spin-north" aria-label="Spin Globe Map north">▲</button>
        <button class="globe-control" type="button" data-globe-control="spin-south" aria-label="Spin Globe Map south">▼</button>
        <button class="globe-control" type="button" data-globe-control="zoom-out" aria-label="Zoom Globe Map out">−</button>
        <button class="globe-control" type="button" data-globe-control="zoom-in" aria-label="Zoom Globe Map in">+</button>
        <span class="globe-control-status">Center ${normalizedGlobeView.rotationLatitude.toFixed(0)}°, ${normalizedGlobeView.rotationLongitude.toFixed(0)}° · ${Math.round(normalizedGlobeView.zoom * 100)}% zoom</span>
      </div>
      <div class="map-viewport" data-globe-drag-surface aria-label="Draggable round Globe Map surface">
        <div class="globe-sphere" aria-hidden="true"></div>
        ${renderGlobeGeography(normalizedGlobeView)}
        <div class="map-grid"></div>
        ${renderedMarkers
          .map((marker) => {
            const isAggregated = marker.incidentCount > 1;
            const isAggregateDrillDownSelected =
              aggregateDrillDownIncidentIds.size > 0 && marker.incidentIds.some((incidentId) => aggregateDrillDownIncidentIds.has(incidentId));
            const isSelected =
              selectedIncidentId !== null && (marker.id === selectedIncidentId || marker.incidentIds.includes(selectedIncidentId));
            const selectedIncidentInMarker =
              selectedIncidentId !== null && marker.incidentIds.includes(selectedIncidentId) ? selectedIncident : null;
            const markerSelectionIncidentId = selectedIncidentInMarker?.id ?? marker.id;
            const isAreaSearchNearby = marker.incidentIds.some((incidentId) => areaSearchNearbyIncidentIds.has(incidentId));
            const severity = marker.severityLabel ?? "unscored";
            const markerSeverityText =
              marker.severityScore === null
                ? "app score unavailable"
                : `app score ${marker.severityScore}/100 (${formatSeverityLabel(marker.severityLabel)} normalized ranking)`;
            const markerMeasurementText =
              marker.sourceReportedMeasurementSummary === null
                ? `no source-reported measurements published by ${marker.sourceName}`
                : `source-reported measurements: ${marker.sourceReportedMeasurementSummary}`;
            const markerCategoryLabel = formatCategoryLabel(marker.category);
            const markerCategoryPhrase = markerCategoryLabel.endsWith("Incident") ? markerCategoryLabel : `${markerCategoryLabel} Incident`;
            const markerLabel = isAggregated
              ? selectedIncidentInMarker === null
                ? `${marker.title} near ${marker.latitude.toFixed(1)}, ${marker.longitude.toFixed(1)} from ${marker.sourceName}; ${markerMeasurementText}; drill into ${marker.incidentCount} Incidents and select the highest app-ranked Incident`
                : `${marker.title} containing selected Incident ${selectedIncidentInMarker.title} near ${marker.latitude.toFixed(1)}, ${marker.longitude.toFixed(1)} from ${marker.sourceName}; ${markerMeasurementText}; drill into ${marker.incidentCount} Incidents`
              : `${markerCategoryPhrase} from ${marker.sourceName}: ${marker.title}; ${markerMeasurementText}; ${markerSeverityText}`;

            return `
              <button
                class="map-marker map-marker--${escapeHtml(marker.category)} map-marker--severity-${escapeHtml(severity)}${isAggregated ? " map-marker--aggregate" : ""}${isSelected ? " map-marker--selected" : ""}${isAreaSearchNearby ? " map-marker--area-search-nearby" : ""}${isAggregateDrillDownSelected ? " map-marker--aggregate-drill-down-selected" : ""}"
                type="button"
                style="left: ${marker.leftPercent.toFixed(2)}%; top: ${marker.topPercent.toFixed(2)}%; --marker-depth: ${marker.depth.toFixed(2)};"
                title="${escapeHtml(markerLabel)}"
                aria-label="Select ${escapeHtml(markerLabel)}"
                aria-pressed="${isSelected ? "true" : "false"}"
                data-select-incident="${escapeHtml(markerSelectionIncidentId)}"
                data-selection-surface="map"
                data-map-marker-incident-ids="${escapeHtml(marker.incidentIds.join(" "))}"
                data-aggregate-drill-down-selected="${isAggregateDrillDownSelected ? "true" : "false"}"
                data-source="${escapeHtml(marker.source)}"
                data-incident-count="${marker.incidentCount}"
                data-area-search-nearby="${isAreaSearchNearby ? "true" : "false"}"
                data-globe-visibility="${marker.isVisible ? "front" : "far-side"}"
              >
                ${isAggregated ? `<span class="map-marker-count" aria-hidden="true">${marker.incidentCount}</span>` : ""}
                <span class="sr-only">${escapeHtml(markerLabel)}</span>
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
              ? `<span class="fallback-text">${
                  markers.length === 0 ? "No geocoded Incidents" : "Spin to view far-side Public Feeds"
                }</span>`
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

type GlobeGeographyFeatureLayer = "surface" | "relief" | "coastline";

const GLOBE_GRATICULE_LATITUDES = [-60, -30, 0, 30, 60] as const;
const GLOBE_GRATICULE_LONGITUDES = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180] as const;
const GLOBE_GRATICULE_STEP_DEGREES = 5;

function renderGlobeGeography(globeView: DashboardGlobeView): string {
  const landFeatures = OPEN_EARTH_GEOGRAPHY_FEATURES.filter((feature) => feature.kind === "land");
  const boundaryFeatures = OPEN_EARTH_GEOGRAPHY_FEATURES.filter((feature) => feature.kind === "boundary");
  const landReliefPaths = landFeatures.map((feature) => renderGlobeGeographyFeature(feature, globeView, "relief")).join("");
  const landPaths = landFeatures.map((feature) => renderGlobeGeographyFeature(feature, globeView)).join("");
  const coastlinePaths = landFeatures.map((feature) => renderGlobeGeographyFeature(feature, globeView, "coastline")).join("");
  const boundaryPaths = boundaryFeatures.map((feature) => renderGlobeGeographyFeature(feature, globeView)).join("");
  const graticulePaths = renderGlobeGraticule(globeView);

  return `
    <svg
      class="map-geography"
      viewBox="0 0 100 100"
      role="img"
      aria-label="Open Earth geography showing recognizable continents, coastlines, and political boundaries"
      data-open-geography="${escapeHtml(OPEN_EARTH_GEOGRAPHY_SOURCE)}"
      data-globe-center-latitude="${globeView.rotationLatitude.toFixed(2)}"
      data-globe-center-longitude="${globeView.rotationLongitude.toFixed(2)}"
      data-globe-zoom="${globeView.zoom.toFixed(2)}"
    >
      <defs>
        <radialGradient id="globe-ocean-gradient" cx="34%" cy="28%" r="72%">
          <stop offset="0%" stop-color="#38bdf8"></stop>
          <stop offset="30%" stop-color="#0ea5e9"></stop>
          <stop offset="68%" stop-color="#075985"></stop>
          <stop offset="100%" stop-color="#082f49"></stop>
        </radialGradient>
        <radialGradient id="globe-atmosphere-gradient" cx="35%" cy="24%" r="76%">
          <stop offset="0%" stop-color="#e0f2fe" stop-opacity="0.26"></stop>
          <stop offset="58%" stop-color="#7dd3fc" stop-opacity="0.04"></stop>
          <stop offset="100%" stop-color="#020617" stop-opacity="0.74"></stop>
        </radialGradient>
        <linearGradient id="globe-land-gradient" x1="18%" y1="18%" x2="86%" y2="82%">
          <stop offset="0%" stop-color="#bef264" stop-opacity="0.78"></stop>
          <stop offset="42%" stop-color="#2dd4bf" stop-opacity="0.7"></stop>
          <stop offset="100%" stop-color="#0f766e" stop-opacity="0.68"></stop>
        </linearGradient>
        <clipPath id="globe-geography-horizon">
          <circle cx="50" cy="50" r="49"></circle>
        </clipPath>
      </defs>
      <circle class="map-geography__ocean" cx="50" cy="50" r="49"></circle>
      <g class="map-geography__ocean-context" clip-path="url(#globe-geography-horizon)" aria-hidden="true">
        <circle class="map-geography__ocean-depth map-geography__ocean-depth--outer" cx="50" cy="50" r="43"></circle>
        <circle class="map-geography__ocean-depth map-geography__ocean-depth--mid" cx="50" cy="50" r="31"></circle>
        <circle class="map-geography__ocean-depth map-geography__ocean-depth--inner" cx="50" cy="50" r="19"></circle>
        <path class="map-geography__ocean-current" d="M 13 44 C 28 34 42 36 56 43 S 82 53 91 42"></path>
        <path class="map-geography__ocean-current map-geography__ocean-current--south" d="M 16 65 C 31 58 47 59 62 66 S 81 76 91 66"></path>
      </g>
      <g class="map-geography__graticule-layer" clip-path="url(#globe-geography-horizon)" aria-hidden="true">
        ${graticulePaths}
      </g>
      <g class="map-geography__land-relief-layer" clip-path="url(#globe-geography-horizon)" aria-hidden="true">
        ${landReliefPaths}
      </g>
      <g class="map-geography__land-layer" clip-path="url(#globe-geography-horizon)">
        ${landPaths}
      </g>
      <g class="map-geography__coastline-layer" clip-path="url(#globe-geography-horizon)" aria-hidden="true">
        ${coastlinePaths}
      </g>
      <g class="map-geography__boundary-layer" clip-path="url(#globe-geography-horizon)">
        ${boundaryPaths}
      </g>
      <ellipse class="map-geography__terminator" cx="64" cy="56" rx="31" ry="43" aria-hidden="true"></ellipse>
      <circle class="map-geography__atmosphere" cx="50" cy="50" r="49" aria-hidden="true"></circle>
    </svg>
  `;
}

function renderGlobeGraticule(globeView: DashboardGlobeView): string {
  const latitudePaths = GLOBE_GRATICULE_LATITUDES.map((latitude) =>
    buildGlobeGraticuleLine(
      Array.from({ length: 73 }, (_, index): GlobeCoordinate => [-180 + index * GLOBE_GRATICULE_STEP_DEGREES, latitude]),
      globeView,
      latitude === 0 ? "equator" : "latitude",
    ),
  );
  const longitudePaths = GLOBE_GRATICULE_LONGITUDES.map((longitude) =>
    buildGlobeGraticuleLine(
      Array.from({ length: 37 }, (_, index): GlobeCoordinate => [longitude, -90 + index * GLOBE_GRATICULE_STEP_DEGREES]),
      globeView,
      "longitude",
    ),
  );

  return [...latitudePaths, ...longitudePaths].join("");
}

function buildGlobeGraticuleLine(
  coordinates: GlobeCoordinate[],
  globeView: DashboardGlobeView,
  lineKind: "equator" | "latitude" | "longitude",
): string {
  const pathData = buildOpenGlobeGeographyPath(
    coordinates.map(([longitude, latitude]) => projectGlobeGeographyCoordinate(latitude, longitude, globeView)),
  );

  return pathData === "" ? "" : `<path class="map-geography__graticule map-geography__graticule--${lineKind}" d="${pathData}"></path>`;
}

function renderGlobeGeographyFeature(
  feature: GlobeGeographyFeature,
  globeView: DashboardGlobeView,
  layer: GlobeGeographyFeatureLayer = "surface",
): string {
  const projectedCoordinates = feature.coordinates.map(([longitude, latitude]) =>
    projectGlobeGeographyCoordinate(latitude, longitude, globeView),
  );
  const pathData = feature.closed
    ? buildClosedGlobeGeographyPath(projectedCoordinates)
    : buildOpenGlobeGeographyPath(projectedCoordinates);

  if (pathData === "") {
    return "";
  }

  const accessibilityAttributes = layer === "surface" ? `aria-label="${escapeHtml(feature.label)}"` : `aria-hidden="true"`;
  return `<path class="map-geography__feature map-geography__feature--${feature.kind} map-geography__feature--${feature.kind}-${layer}" d="${pathData}" ${accessibilityAttributes}></path>`;
}

function buildClosedGlobeGeographyPath(projectedCoordinates: ProjectedGlobeCoordinate[]): string {
  const visibleCoordinates = projectedCoordinates.filter((coordinate) => coordinate.isVisible);

  if (visibleCoordinates.length < 3) {
    return "";
  }

  return `${visibleCoordinates
    .map((coordinate, index) => `${index === 0 ? "M" : "L"} ${formatSvgCoordinate(coordinate.x)} ${formatSvgCoordinate(coordinate.y)}`)
    .join(" ")} Z`;
}

function buildOpenGlobeGeographyPath(projectedCoordinates: ProjectedGlobeCoordinate[]): string {
  const pathSegments: string[] = [];
  let activeSegment: ProjectedGlobeCoordinate[] = [];

  for (const coordinate of projectedCoordinates) {
    if (coordinate.isVisible) {
      activeSegment.push(coordinate);
      continue;
    }

    appendOpenGlobeGeographySegment(pathSegments, activeSegment);
    activeSegment = [];
  }

  appendOpenGlobeGeographySegment(pathSegments, activeSegment);

  return pathSegments.join(" ");
}

function appendOpenGlobeGeographySegment(
  pathSegments: string[],
  segmentCoordinates: ProjectedGlobeCoordinate[],
): void {
  if (segmentCoordinates.length < 2) {
    return;
  }

  pathSegments.push(
    segmentCoordinates
      .map((coordinate, index) => `${index === 0 ? "M" : "L"} ${formatSvgCoordinate(coordinate.x)} ${formatSvgCoordinate(coordinate.y)}`)
      .join(" "),
  );
}

function projectGlobeGeographyCoordinate(
  latitude: number,
  longitude: number,
  rawGlobeView: DashboardGlobeView,
): ProjectedGlobeCoordinate {
  const globeView = normalizeDashboardGlobeView(rawGlobeView);
  const latitudeRadians = toGlobeRadians(latitude);
  const longitudeDeltaRadians = toGlobeRadians(normalizeGlobeLongitude(longitude - globeView.rotationLongitude));
  const centerLatitudeRadians = toGlobeRadians(globeView.rotationLatitude);
  const cosLatitude = Math.cos(latitudeRadians);
  const x = cosLatitude * Math.sin(longitudeDeltaRadians);
  const y =
    Math.cos(centerLatitudeRadians) * Math.sin(latitudeRadians) -
    Math.sin(centerLatitudeRadians) * cosLatitude * Math.cos(longitudeDeltaRadians);
  const depth =
    Math.sin(centerLatitudeRadians) * Math.sin(latitudeRadians) +
    Math.cos(centerLatitudeRadians) * cosLatitude * Math.cos(longitudeDeltaRadians);
  const radiusPercent = GLOBE_GEOGRAPHY_RADIUS_PERCENT * globeView.zoom;

  return {
    x: 50 + x * radiusPercent,
    y: 50 - y * radiusPercent,
    depth,
    isVisible: depth > GLOBE_GEOGRAPHY_HORIZON_DEPTH,
  };
}

function formatSvgCoordinate(value: number): string {
  return value.toFixed(2);
}

function normalizeGlobeLongitude(longitude: number): number {
  const normalizedLongitude = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalizedLongitude, -0) ? 0 : normalizedLongitude;
}

function toGlobeRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
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
  areaSearch: AreaSearchResolution,
  aggregateMarkerDrillDown: AggregateMarkerDrillDownResolution,
): string {
  if (!hasIncidents) {
    return `<div class="empty-state"><strong>No Incidents available.</strong><p>Reachable Public Feeds returned no normalized Incidents.</p></div>`;
  }

  if (incidents.length === 0) {
    return `<div class="empty-state"><strong>No matching Incidents.</strong><p>Adjust filters to expand the Filtered Incident Set.</p></div>`;
  }

  const aggregateDrillDownIncidentIds = new Set(aggregateMarkerDrillDown.activeIncidentIds);

  return `
    <div class="incident-list">
      ${incidents
        .map((incident) =>
          renderIncidentCard(
            incident,
            incident.id === selectedIncidentId,
            isIncidentSaved(savedEvents, incident.id),
            isIncidentAreaSearchNearby(incident.id, areaSearch),
            aggregateDrillDownIncidentIds.has(incident.id),
          ),
        )
        .join("")}
    </div>
  `;
}

function renderIncidentCard(
  incident: Incident,
  isSelected: boolean,
  isSaved: boolean,
  isAreaSearchNearby = false,
  isAggregateDrillDownSelected = false,
): string {
  const severity = incident.severityLabel ?? "unscored";
  const severityText = formatIncidentSeverityScoreCompactText(incident);
  const sourceReportedMeasurementFields = buildSourceReportedMeasurementFields(incident);
  const coordinateText =
    incident.coordinates === null
      ? "Coordinates unavailable"
      : `${incident.coordinates.latitude.toFixed(2)}, ${incident.coordinates.longitude.toFixed(2)}`;
  const areaSearchBadge = isAreaSearchNearby ? `<span class="area-search-badge">Area Search nearby</span>` : "";
  const aggregateDrillDownBadge = isAggregateDrillDownSelected
    ? `<span class="area-search-badge">Selected aggregate Incident Marker</span>`
    : "";

  return `
    <article
      id="incident-${escapeHtml(incident.id)}"
      class="incident-card incident-card--${escapeHtml(incident.category)} incident-card--severity-${escapeHtml(severity)}${isSelected ? " incident-card--selected" : ""}${isAreaSearchNearby ? " incident-card--area-search-nearby" : ""}${isAggregateDrillDownSelected ? " incident-card--aggregate-drill-down" : ""}"
      data-incident-id="${escapeHtml(incident.id)}"
      data-area-search-nearby="${isAreaSearchNearby ? "true" : "false"}"
      data-aggregate-drill-down-selected="${isAggregateDrillDownSelected ? "true" : "false"}"
      aria-current="${isSelected ? "true" : "false"}"
    >
      <div>
        <button class="incident-select-button" type="button" data-select-incident="${escapeHtml(incident.id)}" data-selection-surface="feed">
          <span class="category-pill category-pill--${escapeHtml(incident.category)}">${escapeHtml(formatCategoryLabel(incident.category))}</span>
          <span class="severity-pill severity-pill--${escapeHtml(severity)}">${escapeHtml(severityText)}</span>
          ${renderSourceAttributionBadge(incident.source, incident.sourceName)}
          ${areaSearchBadge}
          ${aggregateDrillDownBadge}
          <span class="incident-select-title">${escapeHtml(incident.title)}</span>
        </button>
      </div>
      <dl>
        <div><dt>Public Feed</dt><dd>${escapeHtml(incident.sourceName)}</dd></div>
        <div><dt>App Severity Score</dt><dd>${escapeHtml(formatIncidentSeverityText(incident))}</dd></div>
        <div><dt>Started</dt><dd>${escapeHtml(formatDashboardTimestamp(incident.startedAt))}</dd></div>
        <div><dt>Coordinates</dt><dd>${escapeHtml(coordinateText)}</dd></div>
      </dl>
      ${renderIncidentCardSourceReportedMeasurements(sourceReportedMeasurementFields)}
      <div class="incident-card-actions">
        ${renderSavedEventToggleControl(incident, isSaved, "feed")}
        ${incident.sourceUrl === null ? "" : `<a href="${escapeHtml(incident.sourceUrl)}" target="_blank" rel="noreferrer">Open source attribution</a>`}
      </div>
    </article>
  `;
}

function isIncidentAreaSearchNearby(incidentId: string, areaSearch: AreaSearchResolution): boolean {
  return (
    areaSearch.status === "success" &&
    areaSearch.nearbyIncidents.some((nearbyIncident) => nearbyIncident.incident.id === incidentId)
  );
}

export function renderIncidentDetail(incident: Incident | null, savedEvents: SavedEvent[]): string {
  if (incident === null) {
    return `
      <div class="panel-heading">
        <p class="eyebrow">Incident Detail</p>
        <h2 id="incident-detail-title">No selected Incident</h2>
      </div>
      <div class="empty-state empty-state--compact">
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
      <div class="incident-detail-card__title">
        <span>Selected Incident facts</span>
        <h3>${escapeHtml(detailDisplay.title)}</h3>
      </div>
      <section class="incident-detail-section incident-detail-section--facts" aria-labelledby="incident-detail-facts-heading">
        <h4 id="incident-detail-facts-heading">Selected Incident facts</h4>
        <dl class="incident-detail-grid">
          <div><dt>Category</dt><dd>${escapeHtml(detailDisplay.categoryLabel)}</dd></div>
          <div><dt>App Severity Score</dt><dd>${escapeHtml(detailDisplay.severityText)}</dd></div>
          <div><dt>Location</dt><dd>${escapeHtml(detailDisplay.locationText)}</dd></div>
          <div><dt>Started</dt><dd>${escapeHtml(detailDisplay.startedText)}</dd></div>
          <div><dt>Updated</dt><dd>${escapeHtml(detailDisplay.updatedText)}</dd></div>
        </dl>
      </section>
      <section class="incident-detail-section incident-detail-section--source" aria-labelledby="incident-detail-source-heading">
        <h4 id="incident-detail-source-heading">Source attribution</h4>
        <dl class="incident-detail-grid incident-detail-grid--source">
          <div><dt>Public Feed</dt><dd>${escapeHtml(incident.sourceName)}</dd></div>
          <div><dt>Source link</dt><dd>${sourceLink}</dd></div>
          <div><dt>Source record</dt><dd>${escapeHtml(detailDisplay.sourceRecordText)}</dd></div>
        </dl>
      </section>
      <section class="incident-detail-section incident-detail-metrics" aria-label="Source-reported measurements">
        <h4>Source-reported measurements</h4>
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
  aiBriefingChoice: AiBriefingChoice | null,
): string {
  const isAiBriefingOff = aiBriefingChoice === null || aiBriefingChoice === "disabled";
  const singleIncidentDisabled = isAiBriefingOff || selectedIncident === null || aiBriefing.status === "loading";
  const filteredIncidentSetDisabled = isAiBriefingOff || filteredIncidentSet.length === 0 || aiBriefing.status === "loading";
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
    <section class="ai-briefing-request-panel" aria-labelledby="ai-briefing-request-heading">
      <div class="section-heading">
        <span>Request controls</span>
        <h3 id="ai-briefing-request-heading">Choose briefing scope</h3>
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
        Sends only public Incident fields from the dashboard. Public Social Context, when included, is localized summary only and omits usernames, direct quotes, private or auth-walled content, PII, and confidential data.
      </p>
    </section>
    <section class="ai-briefing-provider-panel" aria-labelledby="ai-briefing-provider-heading">
      <div class="section-heading">
        <span>Provider guidance</span>
        <h3 id="ai-briefing-provider-heading">Selected AI Briefing Provider</h3>
      </div>
      <p class="ai-briefing-choice-note" data-ai-briefing-choice-note>
        ${escapeHtml(formatAiBriefingPanelChoiceNote(aiBriefingChoice))}
      </p>
      <p class="ai-briefing-provider-note">Uses the AI Briefing Choice saved in the Settings Control; choose Disabled there to keep AI Briefing requests off.</p>
    </section>
    ${renderAiBriefingSourceContext(selectedIncident, filteredIncidentSet)}
    <div class="ai-briefing-status" role="status" aria-live="polite" data-state="${escapeHtml(isAiBriefingOff ? "disabled" : aiBriefing.status)}">
      ${isAiBriefingOff ? renderAiBriefingOffStatus(aiBriefingChoice) : renderAiBriefingStatus(aiBriefing, activeScopeText)}
    </div>
  `;
}

function formatAiBriefingPanelChoiceNote(aiBriefingChoice: AiBriefingChoice | null): string {
  if (aiBriefingChoice === null) {
    return "Choose an AI Briefing Provider in the Settings Control before requesting AI Briefings.";
  }

  if (aiBriefingChoice === "disabled") {
    return "AI Briefing Choice is Disabled, so AI Briefings are off while the Global Crisis Dashboard remains usable.";
  }

  return `AI Briefing Choice is ${formatAiBriefingProviderLabel(aiBriefingChoice)}.`;
}

function renderAiBriefingOffStatus(aiBriefingChoice: AiBriefingChoice | null): string {
  if (aiBriefingChoice === null) {
    return `<p>Choose an AI Briefing Provider in the Settings Control to enable AI Briefings, or select Disabled to keep them off.</p>`;
  }

  return `
    <div class="ai-briefing-disabled">
      <strong>AI Briefings are off</strong>
      <p>AI Briefing Choice is Disabled. Incident Feed, Globe Map, filters, Incident Detail, Saved Events View, and Source Status remain usable.</p>
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
        <small>Public Social Context was not produced for this request; Incident selection and the rest of the Global Crisis Dashboard remain usable.</small>
      </div>
    `;
  }

  if (aiBriefing.status === "ready" && aiBriefing.output !== null) {
    return `
      <article class="ai-briefing-output">
        <section class="ai-briefing-block ai-briefing-block--situation-summary">
          <h3>Situation summary</h3>
          <p>${escapeHtml(aiBriefing.output.situationSummary)}</p>
        </section>
        <section class="ai-briefing-block ai-briefing-block--impact-considerations">
          <h3>Likely impact considerations</h3>
          <p>${escapeHtml(aiBriefing.output.impactConsiderations)}</p>
        </section>
        ${renderPublicSocialContextSection(aiBriefing.publicSocialContext)}
        <section class="ai-briefing-block ai-briefing-block--response-priority">
          <h3>Response Priority Recommendation</h3>
          <p>${escapeHtml(aiBriefing.output.responsePriorityRecommendation)}</p>
        </section>
        <section class="ai-briefing-block ai-briefing-block--uncertainty-note">
          <h3>Uncertainty Note</h3>
          <ul>
            ${aiBriefing.output.uncertaintyNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
          </ul>
        </section>
      </article>
      ${renderPublicSocialContextLimitation(aiBriefing.publicSocialContextLimitation)}
    `;
  }

  return `<p>Choose a selected Incident or the current Filtered Incident Set to generate an AI Briefing.</p>`;
}

function renderPublicSocialContextSection(publicSocialContext: PublicSocialContext | null): string {
  if (publicSocialContext === null) {
    return "";
  }

  return `
    <section class="ai-briefing-block ai-briefing-block--public-social-context ai-briefing-public-social-context">
      <h3>Public Social Context</h3>
      <p>${escapeHtml(publicSocialContext.safetyNotice)} Locality: ${escapeHtml(publicSocialContext.locality)}.</p>
      <ul>
        ${publicSocialContext.signals
          .map(
            (signal) => `
              <li>
                <strong>${escapeHtml(signal.topic)}</strong>
                <span>${escapeHtml(signal.localizedSummary)}</span>
                <small>${escapeHtml(formatPublicSocialContextSignalSource(signal))}</small>
              </li>
            `,
          )
          .join("")}
      </ul>
    </section>
  `;
}

function formatPublicSocialContextSignalSource(signal: PublicSocialContext["signals"][number]): string {
  const sourceType =
    signal.sourceType === "public_official"
      ? "Public official"
      : signal.sourceType === "public_web"
        ? "Public web"
        : "Public social";
  const observedAt = signal.observedAt === null ? "Observed time unavailable" : `Observed ${formatDashboardTimestamp(signal.observedAt)}`;
  const sourceUrl = signal.sourceUrl === null ? "source URL unavailable" : "source URL retained after safety review";

  return `${sourceType} signal · ${observedAt} · ${sourceUrl}`;
}

function renderPublicSocialContextLimitation(publicSocialContextLimitation: string | null): string {
  if (publicSocialContextLimitation === null) {
    return "";
  }

  return `
    <p class="ai-briefing-context-limitation">
      ${escapeHtml(publicSocialContextLimitation)}
    </p>
  `;
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
  const publicSocialContextText =
    selectedIncident === null
      ? "Public Social Context is requested only for a selected Incident and remains separate from Filtered Incident Set public-feed facts."
      : "Public Social Context is scoped to this selected Incident's place, time, category, and source facts, and remains separate from core Public Feed facts.";
  const severityContextText =
    selectedIncident === null
      ? "AI Briefings must describe Severity Score only as the app's normalized ranking and use source-reported measurements only when included by a Public Feed."
      : `${formatIncidentSeverityText(selectedIncident)}. Source-reported measurements are listed separately when ${selectedIncident.sourceName} supplied them.`;

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
      <small>${escapeHtml(severityContextText)}</small>
      <small>${escapeHtml(publicSocialContextText)}</small>
    </div>
  `;
}

function renderIncidentCardSourceReportedMeasurements(fields: SourceReportedMeasurementField[]): string {
  if (fields.length === 0) {
    return "";
  }

  return `
    <section class="incident-card-measurements" aria-label="Source-reported measurements">
      <h4>Source-reported measurements</h4>
      <dl>
        ${fields
          .map(
            (field) =>
              `<div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(field.value)} <span>from ${escapeHtml(field.sourceName)}</span></dd></div>`,
          )
          .join("")}
      </dl>
    </section>
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
    case "noaa-nws-alerts":
      return "NWS";
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
  dashboardRoot.querySelector<HTMLButtonElement>("[data-settings-control-toggle]")?.addEventListener("click", () => {
    state.settingsControlOpen = !state.settingsControlOpen;
    render();
  });

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

  dashboardRoot.querySelector<HTMLSelectElement>("[data-ai-briefing-choice-control]")?.addEventListener("change", (event) => {
    const control = event.currentTarget;
    if (!(control instanceof HTMLSelectElement) || !isAiBriefingChoice(control.value)) {
      return;
    }

    state.aiBriefingChoice = persistAiBriefingChoice(control.value);
    aiBriefingRequestToken += 1;
    state.aiBriefing = {
      status: "idle",
      activeScope: null,
      incidentId: null,
      output: null,
      errorMessage: null,
      publicSocialContext: null,
      publicSocialContextLimitation: null,
    };
    render();
  });

  dashboardRoot.querySelectorAll<HTMLButtonElement>("[data-refresh]").forEach((button) => {
    button.addEventListener("click", () => void refreshGlobalCrisisDashboard());
  });

  dashboardRoot.querySelectorAll<HTMLButtonElement>("[data-globe-control]").forEach((button) => {
    button.addEventListener("click", () => {
      cancelGlobeInertia();
      adjustGlobeView(button.dataset.globeControl ?? "");
      render();
    });
  });

  dashboardRoot.querySelector<HTMLElement>("[data-globe-drag-surface]")?.addEventListener("pointerdown", startGlobeDrag);
  dashboardRoot.querySelector<HTMLElement>(".map-canvas")?.addEventListener(
    "click",
    (event) => {
      const clickTarget = event.target;
      const isDragSurfaceClick =
        clickTarget instanceof Element && clickTarget.closest("[data-globe-drag-surface]") !== null;

      if (!suppressNextGlobeClick) {
        return;
      }

      suppressNextGlobeClick = false;
      if (!isDragSurfaceClick) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );

  dashboardRoot.querySelector<HTMLFormElement>("[data-area-search-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    applyAreaSearch(readFormValue(new FormData(form), "areaSearchQuery"));
  });

  dashboardRoot.querySelector<HTMLButtonElement>("[data-clear-area-search]")?.addEventListener("click", () => {
    state.areaSearch = createIdleAreaSearchResolution();
    render();
  });

  dashboardRoot.querySelectorAll<HTMLButtonElement>("[data-select-area-search-candidate]").forEach((button) => {
    button.addEventListener("click", () => {
      const candidateId = button.dataset.selectAreaSearchCandidate;
      if (candidateId === undefined || state.areaSearch.status !== "ambiguous") {
        return;
      }

      const candidate = state.areaSearch.candidates.find((area) => area.id === candidateId);
      if (candidate === undefined) {
        return;
      }

      applyAreaSearch(candidate.label);
    });
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

      if (button.dataset.selectionSurface === "map") {
        selectGlobeMapMarker(selectedIncidentId);
        return;
      }

      cancelGlobeInertia();
      state.aggregateMarkerDrillDown = null;
      state.selectedIncidentId = selectedIncidentId;
      resetSingleIncidentAiBriefingIfStale(selectedIncidentId);
      focusGlobeOnIncident(selectedIncidentId);
      render();
    });
  });

  dashboardRoot.querySelectorAll<HTMLButtonElement>("[data-select-saved-event]").forEach((button) => {
    button.addEventListener("click", () => {
      const selectedIncidentId = button.dataset.selectSavedEvent ?? null;
      if (selectedIncidentId === null) {
        return;
      }

      state.filters = {};
      cancelGlobeInertia();
      state.aggregateMarkerDrillDown = null;
      state.selectedIncidentId = selectedIncidentId;
      resetSingleIncidentAiBriefingIfStale(selectedIncidentId);
      focusGlobeOnIncident(selectedIncidentId);
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

function resetSingleIncidentAiBriefingIfStale(selectedIncidentId: string | null): void {
  if (state.aiBriefing.activeScope !== "single-incident" || state.aiBriefing.incidentId === selectedIncidentId) {
    return;
  }

  aiBriefingRequestToken += 1;
  state.aiBriefing = {
    status: "idle",
    activeScope: null,
    incidentId: null,
    output: null,
    errorMessage: null,
    publicSocialContext: null,
    publicSocialContextLimitation: null,
  };
}

function startGlobeDrag(event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }

  if (isGlobeDragInteractiveTarget(event.target)) {
    return;
  }

  cancelGlobeInertia();
  globeDragState.isDragging = true;
  globeDragState.hasMoved = false;
  globeDragState.pointerId = typeof event.pointerId === "number" ? event.pointerId : null;
  globeDragState.lastClientX = event.clientX;
  globeDragState.lastClientY = event.clientY;
  globeDragState.lastTimestamp = event.timeStamp;
  globeDragState.velocityLongitude = 0;
  globeDragState.velocityLatitude = 0;

  const surface = event.currentTarget;
  if (surface instanceof HTMLElement && globeDragState.pointerId !== null && typeof surface.setPointerCapture === "function") {
    surface.setPointerCapture(globeDragState.pointerId);
  }

  document.addEventListener("pointermove", continueGlobeDrag);
  document.addEventListener("pointerup", stopGlobeDrag);
  document.addEventListener("pointercancel", cancelActiveGlobeDrag);
}

function isGlobeDragInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, a, input, select, textarea") !== null;
}

function continueGlobeDrag(event: PointerEvent): void {
  if (!globeDragState.isDragging) {
    return;
  }

  if (globeDragState.pointerId !== null && typeof event.pointerId === "number" && event.pointerId !== globeDragState.pointerId) {
    return;
  }

  const deltaX = event.clientX - globeDragState.lastClientX;
  const deltaY = event.clientY - globeDragState.lastClientY;
  const timeDelta = event.timeStamp - globeDragState.lastTimestamp;

  if (Math.abs(deltaX) + Math.abs(deltaY) >= GLOBE_DRAG_CLICK_SUPPRESSION_PIXELS) {
    globeDragState.hasMoved = true;
  }

  applyGlobeDragDelta(deltaX, deltaY);

  if (timeDelta > 0) {
    const normalizedTimeDelta = Math.max(timeDelta, GLOBE_DRAG_MINIMUM_TIME_DELTA_MS);
    globeDragState.velocityLongitude = clampGlobeInertiaVelocity(
      (-deltaX * GLOBE_DRAG_LONGITUDE_DEGREES_PER_PIXEL * 16) / normalizedTimeDelta,
    );
    globeDragState.velocityLatitude = clampGlobeInertiaVelocity(
      (deltaY * GLOBE_DRAG_LATITUDE_DEGREES_PER_PIXEL * 16) / normalizedTimeDelta,
    );
  }

  scheduleGlobeRender();

  globeDragState.lastClientX = event.clientX;
  globeDragState.lastClientY = event.clientY;
  globeDragState.lastTimestamp = event.timeStamp;
  event.preventDefault();
}

function stopGlobeDrag(event: PointerEvent): void {
  if (globeDragState.pointerId !== null && typeof event.pointerId === "number" && event.pointerId !== globeDragState.pointerId) {
    return;
  }

  const shouldSuppressClick = globeDragState.hasMoved;
  flushScheduledGlobeRender();
  finishGlobeDrag();
  suppressNextGlobeClick = shouldSuppressClick;
  startGlobeInertia();
}

function cancelActiveGlobeDrag(): void {
  flushScheduledGlobeRender();
  finishGlobeDrag();
}

function finishGlobeDrag(): void {
  globeDragState.isDragging = false;
  globeDragState.hasMoved = false;
  globeDragState.pointerId = null;
  document.removeEventListener("pointermove", continueGlobeDrag);
  document.removeEventListener("pointerup", stopGlobeDrag);
  document.removeEventListener("pointercancel", cancelActiveGlobeDrag);
}

function applyGlobeDragDelta(deltaX: number, deltaY: number): void {
  if (deltaX === 0 && deltaY === 0) {
    return;
  }

  state.globeView = normalizeDashboardGlobeView({
    ...state.globeView,
    rotationLongitude: state.globeView.rotationLongitude - deltaX * GLOBE_DRAG_LONGITUDE_DEGREES_PER_PIXEL,
    rotationLatitude: state.globeView.rotationLatitude + deltaY * GLOBE_DRAG_LATITUDE_DEGREES_PER_PIXEL,
  });
}

function clampGlobeInertiaVelocity(velocity: number): number {
  return Math.min(
    Math.max(velocity, -GLOBE_DRAG_MAXIMUM_VELOCITY_DEGREES_PER_FRAME),
    GLOBE_DRAG_MAXIMUM_VELOCITY_DEGREES_PER_FRAME,
  );
}

function scheduleGlobeRender(): void {
  if (globeDragState.pendingRenderFrame !== null) {
    return;
  }

  if (typeof window.requestAnimationFrame !== "function") {
    render();
    return;
  }

  globeDragState.pendingRenderFrame = window.requestAnimationFrame(() => {
    globeDragState.pendingRenderFrame = null;
    render();
  });
}

function flushScheduledGlobeRender(): void {
  if (globeDragState.pendingRenderFrame === null) {
    return;
  }

  if (typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(globeDragState.pendingRenderFrame);
  }

  globeDragState.pendingRenderFrame = null;
  render();
}

function startGlobeInertia(): void {
  const hasInertia =
    Math.abs(globeDragState.velocityLongitude) >= GLOBE_INERTIA_MINIMUM_DEGREES_PER_FRAME ||
    Math.abs(globeDragState.velocityLatitude) >= GLOBE_INERTIA_MINIMUM_DEGREES_PER_FRAME;

  if (!hasInertia || typeof window.requestAnimationFrame !== "function") {
    globeDragState.velocityLongitude = 0;
    globeDragState.velocityLatitude = 0;
    return;
  }

  globeDragState.inertiaRunId += 1;
  const runId = globeDragState.inertiaRunId;

  const step = (): void => {
    if (runId !== globeDragState.inertiaRunId) {
      return;
    }

    state.globeView = normalizeDashboardGlobeView({
      ...state.globeView,
      rotationLongitude: state.globeView.rotationLongitude + globeDragState.velocityLongitude,
      rotationLatitude: state.globeView.rotationLatitude + globeDragState.velocityLatitude,
    });
    globeDragState.velocityLongitude = clampGlobeInertiaVelocity(globeDragState.velocityLongitude * GLOBE_INERTIA_DECAY);
    globeDragState.velocityLatitude = clampGlobeInertiaVelocity(globeDragState.velocityLatitude * GLOBE_INERTIA_DECAY);
    render();

    if (
      Math.abs(globeDragState.velocityLongitude) < GLOBE_INERTIA_MINIMUM_DEGREES_PER_FRAME &&
      Math.abs(globeDragState.velocityLatitude) < GLOBE_INERTIA_MINIMUM_DEGREES_PER_FRAME
    ) {
      globeDragState.inertiaFrame = null;
      globeDragState.velocityLongitude = 0;
      globeDragState.velocityLatitude = 0;
      return;
    }

    globeDragState.inertiaFrame = window.requestAnimationFrame(step);
  };

  globeDragState.inertiaFrame = window.requestAnimationFrame(step);
}

function cancelGlobeInertia(): void {
  globeDragState.inertiaRunId += 1;
  if (globeDragState.inertiaFrame !== null && typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(globeDragState.inertiaFrame);
  }
  flushScheduledGlobeRender();

  globeDragState.inertiaFrame = null;
  globeDragState.velocityLongitude = 0;
  globeDragState.velocityLatitude = 0;
}

function adjustGlobeView(action: string): void {
  switch (action) {
    case "spin-west":
      state.globeView = normalizeDashboardGlobeView({
        ...state.globeView,
        rotationLongitude: state.globeView.rotationLongitude - 24,
      });
      break;
    case "spin-east":
      state.globeView = normalizeDashboardGlobeView({
        ...state.globeView,
        rotationLongitude: state.globeView.rotationLongitude + 24,
      });
      break;
    case "spin-north":
      state.globeView = normalizeDashboardGlobeView({
        ...state.globeView,
        rotationLatitude: state.globeView.rotationLatitude + 14,
      });
      break;
    case "spin-south":
      state.globeView = normalizeDashboardGlobeView({
        ...state.globeView,
        rotationLatitude: state.globeView.rotationLatitude - 14,
      });
      break;
    case "zoom-in":
      state.globeView = normalizeDashboardGlobeView({
        ...state.globeView,
        zoom: state.globeView.zoom + 0.16,
      });
      break;
    case "zoom-out":
      state.globeView = normalizeDashboardGlobeView({
        ...state.globeView,
        zoom: state.globeView.zoom - 0.16,
      });
      break;
  }
}

function applyAreaSearch(query: string): void {
  if (state.collection === null) {
    state.areaSearch = createIdleAreaSearchResolution();
    render();
    return;
  }

  cancelGlobeInertia();
  state.areaSearch = resolveAreaSearchQuery(query, state.collection.incidents);
  if (state.areaSearch.status === "success") {
    state.globeView = focusGlobeViewOnAreaSearchArea(state.areaSearch.area, state.globeView);
  }
  render();
}

function selectGlobeMapMarker(markerId: string): void {
  if (state.collection === null) {
    return;
  }

  const viewModel = buildGlobalCrisisDashboardViewModel(state.collection, state.filters, state.globeView);
  const marker = resolveCurrentDashboardMapMarker(viewModel.mapMarkers, markerId);
  if (marker === null) {
    return;
  }

  cancelGlobeInertia();

  if (marker.incidentCount > 1) {
    const localizedIncidentIds = resolveDashboardMapMarkerIncidentIds(marker, viewModel.filteredIncidentSet);
    state.aggregateMarkerDrillDown = {
      title: marker.title,
      incidentIds: Array.from(new Set(marker.incidentIds)),
    };
    state.selectedIncidentId =
      state.selectedIncidentId !== null && localizedIncidentIds.includes(state.selectedIncidentId)
        ? state.selectedIncidentId
        : localizedIncidentIds.includes(marker.id)
          ? marker.id
          : (localizedIncidentIds[0] ?? null);
    resetSingleIncidentAiBriefingIfStale(state.selectedIncidentId);
    render();
    state.globeView = focusGlobeViewOnDashboardMapMarker(marker, state.globeView);
    render();
    if (state.selectedIncidentId !== null) {
      scrollSelectedIncidentIntoView(state.selectedIncidentId);
    }
    return;
  }

  state.aggregateMarkerDrillDown = null;
  state.selectedIncidentId = marker.id;
  state.globeView = focusGlobeViewOnDashboardMapMarker(marker, state.globeView);
  resetSingleIncidentAiBriefingIfStale(marker.id);
  render();
  scrollSelectedIncidentIntoView(marker.id);
}

function resolveCurrentDashboardMapMarker(markers: DashboardMapMarker[], markerId: string): DashboardMapMarker | null {
  return markers.find((marker) => marker.id === markerId || marker.incidentIds.includes(markerId)) ?? null;
}

function focusGlobeOnIncident(incidentId: string): void {
  if (state.collection === null) {
    return;
  }

  const incident = state.collection.incidents.find((candidate) => candidate.id === incidentId);
  if (incident?.coordinates === null || incident?.coordinates === undefined) {
    return;
  }

  state.globeView = normalizeDashboardGlobeView({
    ...state.globeView,
    rotationLatitude: incident.coordinates.latitude,
    rotationLongitude: incident.coordinates.longitude,
    zoom: state.globeView.zoom + SELECTED_INCIDENT_FOCUS_ZOOM_STEP,
  });
}

async function requestAiBriefing(scope: AiBriefingScope): Promise<void> {
  if (state.collection === null) {
    return;
  }

  if (state.aiBriefingChoice === null || state.aiBriefingChoice === "disabled") {
    state.aiBriefing = {
      status: "idle",
      activeScope: null,
      incidentId: null,
      output: null,
      errorMessage: null,
      publicSocialContext: null,
      publicSocialContextLimitation: null,
    };
    render();
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
      incidentId: null,
      output: null,
      errorMessage: "Select an Incident before requesting an AI Briefing for one Incident.",
      publicSocialContext: null,
      publicSocialContextLimitation: null,
    };
    render();
    return;
  }

  if (scope === "filtered-incident-set" && viewModel.filteredIncidentSet.length === 0) {
    state.aiBriefing = {
      status: "error",
      activeScope: scope,
      incidentId: null,
      output: null,
      errorMessage: "The current Filtered Incident Set is empty. Adjust filters before requesting an AI Briefing.",
      publicSocialContext: null,
      publicSocialContextLimitation: null,
    };
    render();
    return;
  }

  const selectedIncidentPublicSocialContext =
    scope === "single-incident" ? buildSelectedIncidentPublicSocialContext(selectedIncident!, state.aiBriefingChoice) : null;
  const request =
    scope === "single-incident"
      ? buildSingleIncidentBriefingRequest(selectedIncident!, {
          aiBriefingChoice: state.aiBriefingChoice,
          publicSocialContext: selectedIncidentPublicSocialContext,
        })
      : buildFilteredIncidentSetBriefingRequest(viewModel.filteredIncidentSet, state.filters, {
          aiBriefingChoice: state.aiBriefingChoice,
        });
  const publicSocialContextLimitation = formatPublicSocialContextLimitation(scope, selectedIncidentPublicSocialContext);
  const requestToken = ++aiBriefingRequestToken;
  state.aiBriefing = {
    status: "loading",
    activeScope: scope,
    incidentId: scope === "single-incident" ? selectedIncident?.id ?? null : null,
    output: null,
    errorMessage: null,
    publicSocialContext: selectedIncidentPublicSocialContext,
    publicSocialContextLimitation: publicSocialContextLimitation,
  };
  render();

  try {
    const output = await generateAiBriefing(request, { aiBriefingChoice: state.aiBriefingChoice });
    if (requestToken !== aiBriefingRequestToken) {
      return;
    }

    state.aiBriefing = {
      status: "ready",
      activeScope: scope,
      incidentId: scope === "single-incident" ? selectedIncident?.id ?? null : null,
      output,
      errorMessage: null,
      publicSocialContext: selectedIncidentPublicSocialContext,
      publicSocialContextLimitation,
    };
  } catch (error) {
    if (requestToken !== aiBriefingRequestToken) {
      return;
    }

    state.aiBriefing = {
      status: "error",
      activeScope: scope,
      incidentId: scope === "single-incident" ? selectedIncident?.id ?? null : null,
      output: null,
      errorMessage: formatAiBriefingError(error),
      publicSocialContext: null,
      publicSocialContextLimitation,
    };
  } finally {
    if (requestToken === aiBriefingRequestToken) {
      render();
    }
  }
}

function formatPublicSocialContextLimitation(
  scope: AiBriefingScope,
  publicSocialContext: PublicSocialContext | null,
): string | null {
  if (scope !== "single-incident" || publicSocialContext !== null) {
    return null;
  }

  return "Public Social Context unavailable: no safe localized public signal summary could be produced for this selected Incident, so the AI Briefing used only core Public Feed facts.";
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
