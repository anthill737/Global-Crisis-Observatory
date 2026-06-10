(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e={"usgs-earthquakes":`USGS Earthquakes`,"nasa-eonet":`NASA EONET`},t=`https://eonet.gsfc.nasa.gov/api/v3/events`;function n(e,t){return`${e}:${t.trim()}`}function r(e){let t=e.title.trim(),r=e.rawId.trim(),i=y(e.startedAt);if(!r||!t||i===null)return null;let a=ee({category:e.category,severityScore:e.severityScore??null,severityLabel:e.severityLabel??null});return{id:n(e.source,r),title:t,category:e.category,source:e.source,sourceName:e.sourceName,sourceUrl:D(e.sourceUrl),coordinates:b(e.coordinates),startedAt:i,updatedAt:y(e.updatedAt??null),severityScore:a.severityScore,severityLabel:a.severityLabel,rawSource:{publicFeed:e.source,publicFeedName:e.sourceName,originalId:r,retrievedAt:y(e.retrievedAt??null),payload:e.rawPayload}}}function i(t,n={}){let i=O(t.id),a=O(t.properties?.title),o=k(t.properties?.mag),s=fe(t.geometry?.coordinates),c=A(t.properties?.time);return i===null||a===null||c===null?null:r({rawId:i,title:a,category:`earthquake`,source:`usgs-earthquakes`,sourceName:e[`usgs-earthquakes`],sourceUrl:O(t.properties?.url),coordinates:s,startedAt:c,updatedAt:A(t.properties?.updated),severityScore:ce(o),severityLabel:le(o),retrievedAt:n.retrievedAt??null,rawPayload:t})}function a(t,n={}){let i=O(t.id),a=O(t.title),o=pe(t.geometry);return i===null||a===null||o===null?null:r({rawId:i,title:a,category:P(t.categories?.[0]?.id),source:`nasa-eonet`,sourceName:e[`nasa-eonet`],sourceUrl:F(t.sources)??D(O(t.link)),coordinates:M(o.currentGeometry.coordinates),startedAt:o.startedAt,updatedAt:j([o.updatedAt,A(t.closed)],o.startedAt),severityScore:null,severityLabel:null,retrievedAt:n.retrievedAt??null,rawPayload:t})}async function o(e={}){let t=(e.now??(()=>new Date))().toISOString(),n=e.endpoint??`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson`,r=e.fetcher??_();if(r===null)return m([],`unavailable`,t,null,`USGS Earthquakes fetch is unavailable in this runtime.`);try{let e=await r(n,{headers:{Accept:`application/geo+json, application/json`}});if(!e.ok)return m([],`unavailable`,t,null,`USGS Earthquakes returned ${v(e)}.`);let a=ie(await e.json());if(a===null)return m([],`degraded`,t,null,`USGS Earthquakes returned a payload without a features list.`);let o=a.flatMap(e=>{let n=i(e,{retrievedAt:t});return n===null?[]:[n]}),s=a.length-o.length,c=s>0?`Skipped ${s} USGS Earthquakes features missing required Incident fields.`:null;return m(o,s>0?`degraded`:`success`,t,t,c)}catch(e){return m([],`unavailable`,t,null,`USGS Earthquakes fetch failed: ${e instanceof Error?e.message:`unknown error`}.`)}}async function s(e={}){let t=(e.now??(()=>new Date))().toISOString(),n=e.endpoint??(e.limit===void 0?l():l({limit:e.limit})),r=e.fetcher??_();if(r===null)return h([],`unavailable`,t,null,`NASA EONET fetch is unavailable in this runtime.`);try{let e=await r(n,{headers:{Accept:`application/json`}});if(!e.ok)return h([],`unavailable`,t,null,`NASA EONET returned ${v(e)}.`);let i=g(await e.json());if(i===null)return h([],`degraded`,t,null,`NASA EONET returned a payload without an events list.`);let o=i.flatMap(e=>{let n=a(e,{retrievedAt:t});return n===null?[]:[n]}),s=i.length-o.length,c=s>0?`Skipped ${s} NASA EONET payloads missing required Incident fields.`:null;return h(o,s>0?`degraded`:`success`,t,t,c)}catch(e){return h([],`unavailable`,t,null,`NASA EONET fetch failed: ${e instanceof Error?e.message:`unknown error`}.`)}}async function c(e={}){let t=(e.now??(()=>new Date))().toISOString(),n=()=>new Date(t),r={...e.usgsEarthquakes??{}},i={...e.nasaEonet??{}};r.now===void 0&&(r.now=n),i.now===void 0&&(i.now=n);let[a,c]=await Promise.all([o(r).then(u,e=>d(`usgs-earthquakes`,t,`USGS Earthquakes adapter failed before returning Source Status: ${p(e)}.`)),s(i).then(u,e=>d(`nasa-eonet`,t,`NASA EONET adapter failed before returning Source Status: ${p(e)}.`))]),l=[a.sourceStatus,c.sourceStatus];return{incidents:[...a.incidents,...c.incidents].sort(re),sourceStatuses:l,sourceStatusSummary:ne(l),refreshedAt:t}}function l(e={}){let n=new URL(t);return n.searchParams.set(`status`,`open`),n.searchParams.set(`limit`,String(ae(e.limit,50))),n.toString()}function ee(e){let t=oe(e.severityLabel??null),n=x(e.severityScore??null);if(n!==null)return{severityScore:n,severityLabel:C(n)};let r=t===null?se(e.category):S(t);return{severityScore:r,severityLabel:t??C(r)}}function te(e,t={}){let n=T(t.categories),r=T(t.sources),i=T(t.severityLabels),a=w(t.minSeverityScore??null),o=w(t.maxSeverityScore??null),s=ue(t.text??null);return e.filter(e=>!(n!==null&&!n.has(e.category)||r!==null&&!r.has(e.source)||i!==null&&(e.severityLabel===null||!i.has(e.severityLabel))||a!==null&&(e.severityScore===null||e.severityScore<a)||o!==null&&(e.severityScore===null||e.severityScore>o)||s.length>0&&!de(e,s)))}function u(e){return{incidents:[...e.incidents],sourceStatus:e.sourceStatus}}function d(t,n,r){return{incidents:[],sourceStatus:{publicFeed:t,publicFeedName:e[t],state:`unavailable`,lastAttemptedAt:n,lastSuccessfulAt:null,message:r}}}function ne(e){return{sourceCount:e.length,successCount:e.filter(e=>e.state===`success`).length,degradedCount:e.filter(e=>e.state===`degraded`).length,unavailableCount:e.filter(e=>e.state===`unavailable`).length,lastAttemptedAt:f(e.map(e=>e.lastAttemptedAt)),lastSuccessfulAt:f(e.flatMap(e=>e.lastSuccessfulAt===null?[]:[e.lastSuccessfulAt]))}}function re(e,t){return Date.parse(t.updatedAt??t.startedAt)-Date.parse(e.updatedAt??e.startedAt)||e.id.localeCompare(t.id)}function f(e){let t=e.reduce((e,t)=>{let n=Date.parse(t);return Number.isFinite(n)&&(e===null||n>e)?n:e},null);return t===null?null:new Date(t).toISOString()}function p(e){return e instanceof Error?e.message:`unknown error`}function m(t,n,r,i,a){return{incidents:t,sourceStatus:{publicFeed:`usgs-earthquakes`,publicFeedName:e[`usgs-earthquakes`],state:n,lastAttemptedAt:r,lastSuccessfulAt:i,message:a}}}function h(t,n,r,i,a){return{incidents:t,sourceStatus:{publicFeed:`nasa-eonet`,publicFeedName:e[`nasa-eonet`],state:n,lastAttemptedAt:r,lastSuccessfulAt:i,message:a}}}function ie(e){return!I(e)||!Array.isArray(e.features)?null:e.features.filter(I)}function g(e){return!I(e)||!Array.isArray(e.events)?null:e.events.filter(I)}function _(){return typeof globalThis.fetch==`function`?globalThis.fetch.bind(globalThis):null}function v(e){let t=typeof e.status==`number`?String(e.status):`an unsuccessful status`,n=O(e.statusText);return n===null?t:`${t} ${n}`}function ae(e,t){return typeof e==`number`&&Number.isInteger(e)&&e>0?e:t}function y(e){if(e==null||e===``)return null;let t=e instanceof Date?e:new Date(e);return Number.isNaN(t.getTime())?null:t.toISOString()}function b(e){if(e==null)return null;let{latitude:t,longitude:n}=e;return!Number.isFinite(t)||!Number.isFinite(n)||t<-90||t>90||n<-180||n>180?null:{latitude:t,longitude:n}}function x(e){return e===null||!Number.isFinite(e)?null:Math.min(100,Math.max(0,Math.round(e*10)/10))}function oe(e){switch(E(e)?.toLowerCase()){case`minor`:return`minor`;case`moderate`:return`moderate`;case`strong`:return`strong`;case`major`:return`major`;default:return null}}function S(e){switch(e){case`major`:return 85;case`strong`:return 60;case`moderate`:return 40;case`minor`:return 15}}function C(e){return e>=70?`major`:e>=50?`strong`:e>=30?`moderate`:`minor`}function se(e){switch(e){case`wildfire`:return 65;case`severe_storm`:case`volcano`:case`flood`:return 60;case`drought`:return 45;case`sea_lake_ice`:case`dust_haze`:return 35;case`earthquake`:return 40;case`other`:return 20}}function ce(e){return e===null?null:x(e*10)}function le(e){return e===null?null:C(e*10)}function w(e){return x(e)}function T(e){return!Array.isArray(e)||e.length===0?null:new Set(e)}function ue(e){return E(e)?.toLowerCase().split(/\s+/u)??[]}function de(e,t){let n=[e.id,e.title,e.category,e.source,e.sourceName,e.sourceUrl,e.severityLabel,e.rawSource.originalId,e.rawSource.publicFeedName].flatMap(e=>e===null?[]:[e]).join(` `).toLowerCase();return t.every(e=>n.includes(e))}function E(e){if(e===null)return null;let t=e.trim();return t.length===0?null:t}function D(e){let t=E(e??null);if(t===null)return null;try{let e=new URL(t);return e.protocol===`http:`||e.protocol===`https:`?e.toString():null}catch{return null}}function O(e){return typeof e==`string`&&e.trim().length>0?e.trim():null}function k(e){return typeof e==`number`&&Number.isFinite(e)?e:null}function A(e){return typeof e==`string`||typeof e==`number`||e instanceof Date?e:null}function fe(e){if(!Array.isArray(e)||e.length<2)return null;let t=k(e[0]),n=k(e[1]);return n===null||t===null?null:b({latitude:n,longitude:t})}function pe(e){if(!Array.isArray(e))return null;let t=e.flatMap(e=>{let t=y(A(e.date));return t===null?[]:[{geometry:e,timestamp:t,time:new Date(t).getTime()}]}),n=t[0];if(n===void 0)return null;let r=n,i=n;for(let e of t)e.time<r.time&&(r=e),e.time>i.time&&(i=e);return{startedAt:r.timestamp,updatedAt:i.timestamp===r.timestamp?null:i.timestamp,currentGeometry:i.geometry}}function j(e,t){let n=e.flatMap(e=>{let t=y(e);return t===null?[]:[t]});if(n.length===0)return null;let r=n.reduce((e,t)=>new Date(t).getTime()>new Date(e).getTime()?t:e);return r===t?null:r}function M(e){let t=N(e);return t===null?null:b({latitude:t[1],longitude:t[0]})}function N(e){if(!Array.isArray(e))return null;if(e.length>=2&&typeof e[0]==`number`&&typeof e[1]==`number`)return[e[0],e[1]];for(let t of e){let e=N(t);if(e!==null)return e}return null}function P(e){switch(O(e)){case`wildfires`:return`wildfire`;case`severeStorms`:return`severe_storm`;case`volcanoes`:return`volcano`;case`floods`:return`flood`;case`seaLakeIce`:return`sea_lake_ice`;case`drought`:return`drought`;case`dustHaze`:return`dust_haze`;default:return`other`}}function F(e){if(!Array.isArray(e))return null;for(let t of e){let e=D(O(t.url));if(e!==null)return e}return null}function I(e){return typeof e==`object`&&!!e}var L=[`earthquake`,`wildfire`,`severe_storm`,`volcano`,`flood`,`sea_lake_ice`,`drought`,`dust_haze`,`other`],R=[`minor`,`moderate`,`strong`,`major`],z=new Set([`degraded`,`unavailable`]);function B(e,t={}){let n=te(e.incidents,t),r=e.sourceStatuses.some(e=>z.has(e.state));return{title:`Global Crisis Observatory`,refreshedAt:e.refreshedAt,incidents:e.incidents,filteredIncidentSet:n,mapMarkers:n.flatMap(_e),sourceStatuses:e.sourceStatuses,metrics:he(e,n),filterOptions:ge(e.incidents),hasIncidents:e.incidents.length>0,hasFilteredIncidentSet:n.length>0,hasDegradedSourceStatus:r}}function V(e){if(e===null)return`Not yet available`;let t=new Date(e);return Number.isNaN(t.getTime())?`Unknown time`:new Intl.DateTimeFormat(`en`,{dateStyle:`medium`,timeStyle:`short`,timeZone:`UTC`}).format(t)}function H(e){return e.split(`_`).map(e=>e.charAt(0).toUpperCase()+e.slice(1)).join(` `)}function me(e){return e.charAt(0).toUpperCase()+e.slice(1)}function he(e,t){let n=e.sourceStatusSummary,r=n.degradedCount+n.unavailableCount;return[{label:`Filtered Incident Set`,value:String(t.length),detail:`${e.incidents.length} total Incidents from reachable Public Feeds`,tone:t.length>0?`steady`:`attention`},{label:`Public Feeds Online`,value:`${n.successCount}/${n.sourceCount}`,detail:r===0?`All Source Status checks are successful`:`Some Source Status checks need attention`,tone:r===0?`steady`:`attention`},{label:`Source Status Attention`,value:String(r),detail:`${n.degradedCount} degraded, ${n.unavailableCount} unavailable`,tone:n.unavailableCount>0?`critical`:r>0?`attention`:`steady`},{label:`Last Refresh`,value:V(e.refreshedAt),detail:`Latest successful refresh: ${V(n.lastSuccessfulAt)}`,tone:n.lastSuccessfulAt===null?`attention`:`steady`}]}function ge(e){let t=new Set,n=new Map,r=new Set;for(let i of e)t.add(i.category),n.set(i.source,i.sourceName),i.severityLabel!==null&&r.add(i.severityLabel);return{categories:L.filter(e=>t.has(e)),sources:[...n.entries()].map(([e,t])=>({id:e,name:t})).sort((e,t)=>e.name.localeCompare(t.name)),severityLabels:R.filter(e=>r.has(e))}}function _e(e){return e.coordinates===null?[]:[{id:e.id,title:e.title,category:e.category,sourceName:e.sourceName,latitude:e.coordinates.latitude,longitude:e.coordinates.longitude,severityScore:e.severityScore,severityLabel:e.severityLabel,leftPercent:U((e.coordinates.longitude+180)/360*100,3,97),topPercent:U((90-e.coordinates.latitude)/180*100,4,96)}]}function U(e,t,n){return Math.min(n,Math.max(t,e))}var W=document.querySelector(`#app`);if(W===null)throw Error(`Global Crisis Observatory root element was not found.`);var G=W,K={collection:null,filters:{},isLoading:!0,loadError:null};J(),q();async function q(){K.isLoading=!0,K.loadError=null,J();try{K.collection=await c()}catch(e){K.collection=null,K.loadError=e instanceof Error?e.message:`The incident pipeline could not be refreshed.`}finally{K.isLoading=!1,J()}}function J(){if(K.collection===null){G.innerHTML=ve(K),Z();return}let e=B(K.collection,K.filters);G.innerHTML=`
    <main class="dashboard-shell" aria-labelledby="dashboard-title">
      ${Y(e.refreshedAt,K.isLoading,e.hasDegradedSourceStatus)}
      ${ye(e.metrics)}
      <section class="command-grid" aria-label="Global Crisis Dashboard command-center layout">
        <section class="map-panel" aria-labelledby="map-title">
          <div class="panel-heading">
            <p class="eyebrow">Global Map</p>
            <h2 id="map-title">Incident map</h2>
          </div>
          ${X(e.mapMarkers,e.hasFilteredIncidentSet)}
        </section>
        <aside class="filters-panel" aria-labelledby="filters-title">
          <div class="panel-heading">
            <p class="eyebrow">Filters</p>
            <h2 id="filters-title">Refine the Filtered Incident Set</h2>
          </div>
          ${be(e.filterOptions,K.filters)}
        </aside>
        <section class="feed-panel" aria-labelledby="feed-title">
          <div class="panel-heading">
            <p class="eyebrow">Incident Feed</p>
            <h2 id="feed-title">Live public Incidents</h2>
          </div>
          ${xe(e.filteredIncidentSet,e.hasIncidents)}
        </section>
        <aside class="status-panel" aria-labelledby="source-status-title">
          <div class="panel-heading">
            <p class="eyebrow">Source Status</p>
            <h2 id="source-status-title">Public Feed freshness</h2>
          </div>
          ${Ce(e.sourceStatuses)}
        </aside>
      </section>
    </main>
  `,Z()}function ve(e){let t=e.loadError===null?`Loading public Incidents from the adapter pipeline.`:e.loadError,n=e.loadError===null?`loading-card`:`loading-card loading-card--error`;return`
    <main class="dashboard-shell" aria-labelledby="dashboard-title">
      ${Y(null,e.isLoading,e.loadError!==null)}
      <section class="${n}" role="status">
        <p class="eyebrow">Incident pipeline</p>
        <h2>${$(e.loadError===null?`Connecting to Public Feeds`:`Public Feed refresh failed`)}</h2>
        <p>${$(t)}</p>
        <button class="control-button" type="button" data-refresh>Refresh Source Status</button>
      </section>
    </main>
  `}function Y(e,t,n){let r=t?`Refreshing`:n?`Degraded`:`Operational`;return`
    <header class="hero">
      <div>
        <p class="eyebrow">Global Crisis Dashboard</p>
        <h1 id="dashboard-title">Global Crisis Observatory</h1>
        <p class="hero-copy">A command-center view of normalized public natural-disaster and environmental Incidents.</p>
      </div>
      <div class="hero-status" data-state="${$(r.toLowerCase())}">
        <span>${$(r)}</span>
        <small>${$(e===null?`Awaiting first refresh`:`Refreshed ${V(e)} UTC`)}</small>
        <button class="control-button" type="button" data-refresh>${t?`Refreshing…`:`Refresh`}</button>
      </div>
    </header>
  `}function ye(e){return`
    <section class="metrics-grid" aria-label="summary metrics">
      ${e.map(e=>`
            <article class="metric-card" data-tone="${$(e.tone)}">
              <span>${$(e.label)}</span>
              <strong>${$(e.value)}</strong>
              <p>${$(e.detail)}</p>
            </article>
          `).join(``)}
    </section>
  `}function X(e,t){return t?`
    <div class="map-canvas" role="img" aria-label="Map area with styled Incident markers">
      <div class="map-grid"></div>
      ${e.map(e=>`
            <span
              class="map-marker map-marker--${$(e.category)}"
              style="left: ${e.leftPercent.toFixed(2)}%; top: ${e.topPercent.toFixed(2)}%;"
              title="${$(`${e.title} from ${e.sourceName}`)}"
            >
              <span class="sr-only">${$(e.title)}</span>
            </span>
          `).join(``)}
      ${e.length===0?`<p class="map-note">The Filtered Incident Set has no coordinates yet.</p>`:``}
    </div>
  `:`
      <div class="map-canvas map-canvas--empty">
        <p>No Incidents match the current filters.</p>
      </div>
    `}function be(e,t){return`
    <form class="filters-form" data-filters>
      <label>
        Text search
        <input name="text" type="search" value="${$(t.text??``)}" placeholder="Search title or source" />
      </label>
      <label>
        Category
        <select name="category">
          <option value="">All categories</option>
          ${e.categories.map(e=>`<option value="${$(e)}" ${t.categories?.includes(e)?`selected`:``}>${$(H(e))}</option>`).join(``)}
        </select>
      </label>
      <label>
        Public Feed
        <select name="source">
          <option value="">All Public Feeds</option>
          ${e.sources.map(e=>`<option value="${$(e.id)}" ${t.sources?.includes(e.id)?`selected`:``}>${$(e.name)}</option>`).join(``)}
        </select>
      </label>
      <label>
        Severity Score
        <select name="severity">
          <option value="">All severities</option>
          ${e.severityLabels.map(e=>`<option value="${$(e)}" ${t.severityLabels?.includes(e)?`selected`:``}>${$(e)}</option>`).join(``)}
        </select>
      </label>
      <button class="control-button control-button--secondary" type="button" data-reset-filters>Reset filters</button>
    </form>
  `}function xe(e,t){return t?e.length===0?`<div class="empty-state"><strong>No matching Incidents.</strong><p>Adjust filters to expand the Filtered Incident Set.</p></div>`:`
    <div class="incident-list">
      ${e.map(Se).join(``)}
    </div>
  `:`<div class="empty-state"><strong>No Incidents available.</strong><p>Reachable Public Feeds returned no normalized Incidents.</p></div>`}function Se(e){let t=e.severityLabel??`unscored`,n=e.coordinates===null?`Coordinates unavailable`:`${e.coordinates.latitude.toFixed(2)}, ${e.coordinates.longitude.toFixed(2)}`;return`
    <article class="incident-card">
      <div>
        <span class="category-pill">${$(H(e.category))}</span>
        <h3>${$(e.title)}</h3>
      </div>
      <dl>
        <div><dt>Public Feed</dt><dd>${$(e.sourceName)}</dd></div>
        <div><dt>Severity Score</dt><dd>${$(t)}${e.severityScore===null?``:` · ${e.severityScore}`}</dd></div>
        <div><dt>Started</dt><dd>${$(V(e.startedAt))}</dd></div>
        <div><dt>Coordinates</dt><dd>${$(n)}</dd></div>
      </dl>
      ${e.sourceUrl===null?``:`<a href="${$(e.sourceUrl)}" target="_blank" rel="noreferrer">Open source attribution</a>`}
    </article>
  `}function Ce(e){return`
    <div class="source-status-list">
      ${e.map(e=>`
            <article class="source-status-card" data-state="${$(e.state)}">
              <div>
                <strong>${$(e.publicFeedName)}</strong>
                <span>${$(me(e.state))}</span>
              </div>
              <p>${$(e.message??`Public Feed refreshed successfully.`)}</p>
              <small>Attempted ${$(V(e.lastAttemptedAt))} UTC</small>
            </article>
          `).join(``)}
    </div>
  `}function Z(){G.querySelectorAll(`[data-refresh]`).forEach(e=>{e.addEventListener(`click`,()=>void q())}),G.querySelector(`[data-reset-filters]`)?.addEventListener(`click`,()=>{K.filters={},J()}),G.querySelector(`[data-filters]`)?.addEventListener(`input`,e=>{let t=e.currentTarget;t instanceof HTMLFormElement&&(K.filters=we(t),J())})}function we(e){let t=new FormData(e),n={},r=Q(t,`text`),i=Q(t,`category`),a=Q(t,`source`),o=Q(t,`severity`);return r!==``&&(n.text=r),i!==``&&(n.categories=[i]),a!==``&&(n.sources=[a]),o!==``&&(n.severityLabels=[o]),n}function Q(e,t){let n=e.get(t);return typeof n==`string`?n.trim():``}function $(e){return e.replace(/[&<>"]/g,e=>{switch(e){case`&`:return`&amp;`;case`<`:return`&lt;`;case`>`:return`&gt;`;case`"`:return`&quot;`;default:return e}})}