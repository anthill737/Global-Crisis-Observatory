import "./styles.css";
import {
  buildGlobalCrisisDashboardViewModel,
  formatCategoryLabel,
  formatDashboardTimestamp,
  formatSourceStatusState,
} from "./dashboard";
import {
  fetchCombinedIncidentCollection,
  type CombinedIncidentCollection,
  type Incident,
  type IncidentCategory,
  type IncidentFilters,
  type PublicFeedId,
  type SeverityLabel,
} from "./lib/incidents";

interface DashboardState {
  collection: CombinedIncidentCollection | null;
  filters: IncidentFilters;
  isLoading: boolean;
  loadError: string | null;
}

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (appRoot === null) {
  throw new Error("Global Crisis Observatory root element was not found.");
}

const dashboardRoot = appRoot;

const state: DashboardState = {
  collection: null,
  filters: {},
  isLoading: true,
  loadError: null,
};

render();
void refreshGlobalCrisisDashboard();

async function refreshGlobalCrisisDashboard(): Promise<void> {
  state.isLoading = true;
  state.loadError = null;
  render();

  try {
    state.collection = await fetchCombinedIncidentCollection();
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
  dashboardRoot.innerHTML = `
    <main class="dashboard-shell" aria-labelledby="dashboard-title">
      ${renderHeader(viewModel.refreshedAt, state.isLoading, viewModel.hasDegradedSourceStatus)}
      ${renderMetrics(viewModel.metrics)}
      <section class="command-grid" aria-label="Global Crisis Dashboard command-center layout">
        <section class="map-panel" aria-labelledby="map-title">
          <div class="panel-heading">
            <p class="eyebrow">Global Map</p>
            <h2 id="map-title">Incident map</h2>
          </div>
          ${renderMap(viewModel.mapMarkers, viewModel.hasFilteredIncidentSet)}
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
          ${renderIncidentFeed(viewModel.filteredIncidentSet, viewModel.hasIncidents)}
        </section>
        <aside class="status-panel" aria-labelledby="source-status-title">
          <div class="panel-heading">
            <p class="eyebrow">Source Status</p>
            <h2 id="source-status-title">Public Feed freshness</h2>
          </div>
          ${renderSourceStatuses(viewModel.sourceStatuses)}
        </aside>
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
      ${renderHeader(null, dashboardState.isLoading, dashboardState.loadError !== null)}
      <section class="${statusClass}" role="status">
        <p class="eyebrow">Incident pipeline</p>
        <h2>${escapeHtml(dashboardState.loadError === null ? "Connecting to Public Feeds" : "Public Feed refresh failed")}</h2>
        <p>${escapeHtml(message)}</p>
        <button class="control-button" type="button" data-refresh>Refresh Source Status</button>
      </section>
    </main>
  `;
}

function renderHeader(refreshedAt: string | null, isLoading: boolean, hasDegradedSourceStatus: boolean): string {
  const stateText = isLoading ? "Refreshing" : hasDegradedSourceStatus ? "Degraded" : "Operational";

  return `
    <header class="hero">
      <div>
        <p class="eyebrow">Global Crisis Dashboard</p>
        <h1 id="dashboard-title">Global Crisis Observatory</h1>
        <p class="hero-copy">A command-center view of normalized public natural-disaster and environmental Incidents.</p>
      </div>
      <div class="hero-status" data-state="${escapeHtml(stateText.toLowerCase())}">
        <span>${escapeHtml(stateText)}</span>
        <small>${escapeHtml(refreshedAt === null ? "Awaiting first refresh" : `Refreshed ${formatDashboardTimestamp(refreshedAt)} UTC`)}</small>
        <button class="control-button" type="button" data-refresh>${isLoading ? "Refreshing…" : "Refresh"}</button>
      </div>
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

function renderMap(markers: ReturnType<typeof buildGlobalCrisisDashboardViewModel>["mapMarkers"], hasFilteredIncidentSet: boolean): string {
  if (!hasFilteredIncidentSet) {
    return `
      <div class="map-canvas map-canvas--empty">
        <p>No Incidents match the current filters.</p>
      </div>
    `;
  }

  return `
    <div class="map-canvas" role="img" aria-label="Map area with styled Incident markers">
      <div class="map-grid"></div>
      ${markers
        .map(
          (marker) => `
            <span
              class="map-marker map-marker--${escapeHtml(marker.category)}"
              style="left: ${marker.leftPercent.toFixed(2)}%; top: ${marker.topPercent.toFixed(2)}%;"
              title="${escapeHtml(`${marker.title} from ${marker.sourceName}`)}"
            >
              <span class="sr-only">${escapeHtml(marker.title)}</span>
            </span>
          `,
        )
        .join("")}
      ${markers.length === 0 ? `<p class="map-note">The Filtered Incident Set has no coordinates yet.</p>` : ""}
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

function renderIncidentFeed(incidents: Incident[], hasIncidents: boolean): string {
  if (!hasIncidents) {
    return `<div class="empty-state"><strong>No Incidents available.</strong><p>Reachable Public Feeds returned no normalized Incidents.</p></div>`;
  }

  if (incidents.length === 0) {
    return `<div class="empty-state"><strong>No matching Incidents.</strong><p>Adjust filters to expand the Filtered Incident Set.</p></div>`;
  }

  return `
    <div class="incident-list">
      ${incidents.map(renderIncidentCard).join("")}
    </div>
  `;
}

function renderIncidentCard(incident: Incident): string {
  const severity = incident.severityLabel ?? "unscored";
  const coordinateText =
    incident.coordinates === null
      ? "Coordinates unavailable"
      : `${incident.coordinates.latitude.toFixed(2)}, ${incident.coordinates.longitude.toFixed(2)}`;

  return `
    <article class="incident-card">
      <div>
        <span class="category-pill">${escapeHtml(formatCategoryLabel(incident.category))}</span>
        <h3>${escapeHtml(incident.title)}</h3>
      </div>
      <dl>
        <div><dt>Public Feed</dt><dd>${escapeHtml(incident.sourceName)}</dd></div>
        <div><dt>Severity Score</dt><dd>${escapeHtml(severity)}${incident.severityScore === null ? "" : ` · ${incident.severityScore}`}</dd></div>
        <div><dt>Started</dt><dd>${escapeHtml(formatDashboardTimestamp(incident.startedAt))}</dd></div>
        <div><dt>Coordinates</dt><dd>${escapeHtml(coordinateText)}</dd></div>
      </dl>
      ${incident.sourceUrl === null ? "" : `<a href="${escapeHtml(incident.sourceUrl)}" target="_blank" rel="noreferrer">Open source attribution</a>`}
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
              <div>
                <strong>${escapeHtml(sourceStatus.publicFeedName)}</strong>
                <span>${escapeHtml(formatSourceStatusState(sourceStatus.state))}</span>
              </div>
              <p>${escapeHtml(sourceStatus.message ?? "Public Feed refreshed successfully.")}</p>
              <small>Attempted ${escapeHtml(formatDashboardTimestamp(sourceStatus.lastAttemptedAt))} UTC</small>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function bindGlobalCrisisDashboardActions(): void {
  dashboardRoot.querySelectorAll<HTMLButtonElement>("[data-refresh]").forEach((button) => {
    button.addEventListener("click", () => void refreshGlobalCrisisDashboard());
  });

  dashboardRoot.querySelector<HTMLButtonElement>("[data-reset-filters]")?.addEventListener("click", () => {
    state.filters = {};
    render();
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
