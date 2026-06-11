(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e={"usgs-earthquakes":`USGS Earthquakes`,"nasa-eonet":`NASA EONET`,gdacs:`GDACS`},t=`https://eonet.gsfc.nasa.gov/api/v3/events`,n=`GDACS RSS is not fetched live because its public endpoint does not advertise browser CORS access for this Vite app runtime; USGS Earthquakes and NASA EONET remain active.`;function r(e,t){return`${e}:${t.trim()}`}function i(e){let t=e.title.trim(),n=e.rawId.trim(),i=v(e.startedAt);if(!n||!t||i===null)return null;let a=ne({category:e.category,severityScore:e.severityScore??null,severityLabel:e.severityLabel??null});return{id:r(e.source,n),title:t,category:e.category,source:e.source,sourceName:e.sourceName,sourceUrl:w(e.sourceUrl),coordinates:y(e.coordinates),startedAt:i,updatedAt:v(e.updatedAt??null),severityScore:a.severityScore,severityLabel:a.severityLabel,rawSource:{publicFeed:e.source,publicFeedName:e.sourceName,originalId:n,retrievedAt:v(e.retrievedAt??null),payload:e.rawPayload}}}function a(t,n={}){let r=T(t.id),a=T(t.properties?.title),o=E(t.properties?.mag),s=ye(t.geometry?.coordinates),c=D(t.properties?.time);return r===null||a===null||c===null?null:i({rawId:r,title:a,category:`earthquake`,source:`usgs-earthquakes`,sourceName:e[`usgs-earthquakes`],sourceUrl:T(t.properties?.url),coordinates:s,startedAt:c,updatedAt:D(t.properties?.updated),severityScore:me(o),severityLabel:he(o),retrievedAt:n.retrievedAt??null,rawPayload:t})}function o(t,n={}){let r=T(t.id),a=T(t.title),o=be(t.geometry);return r===null||a===null||o===null?null:i({rawId:r,title:a,category:we(t.categories?.[0]?.id),source:`nasa-eonet`,sourceName:e[`nasa-eonet`],sourceUrl:Te(t.sources)??w(T(t.link)),coordinates:Se(o.currentGeometry.coordinates),startedAt:o.startedAt,updatedAt:xe([o.updatedAt,D(t.closed)],o.startedAt),severityScore:null,severityLabel:null,retrievedAt:n.retrievedAt??null,rawPayload:t})}async function s(e={}){let t=(e.now??(()=>new Date))().toISOString(),n=e.endpoint??`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson`,r=e.fetcher??ce();if(r===null)return g([],`unavailable`,t,null,`USGS Earthquakes fetch is unavailable in this runtime.`);try{let e=await r(n,{headers:{Accept:`application/geo+json, application/json`}});if(!e.ok)return g([],`unavailable`,t,null,`USGS Earthquakes returned ${le(e)}.`);let i=oe(await e.json());if(i===null)return g([],`degraded`,t,null,`USGS Earthquakes returned a payload without a features list.`);let o=i.flatMap(e=>{let n=a(e,{retrievedAt:t});return n===null?[]:[n]}),s=i.length-o.length,c=s>0?`Skipped ${s} USGS Earthquakes features missing required Incident fields.`:null;return g(o,s>0?`degraded`:`success`,t,t,c)}catch(e){return g([],`unavailable`,t,null,`USGS Earthquakes fetch failed: ${e instanceof Error?e.message:`unknown error`}.`)}}async function c(e={}){let t=(e.now??(()=>new Date))().toISOString(),n=e.endpoint??(e.limit===void 0?u():u({limit:e.limit})),r=e.fetcher??ce();if(r===null)return _([],`unavailable`,t,null,`NASA EONET fetch is unavailable in this runtime.`);try{let e=await r(n,{headers:{Accept:`application/json`}});if(!e.ok)return _([],`unavailable`,t,null,`NASA EONET returned ${le(e)}.`);let i=se(await e.json());if(i===null)return _([],`degraded`,t,null,`NASA EONET returned a payload without an events list.`);let a=i.flatMap(e=>{let n=o(e,{retrievedAt:t});return n===null?[]:[n]}),s=i.length-a.length,c=s>0?`Skipped ${s} NASA EONET payloads missing required Incident fields.`:null;return _(a,s>0?`degraded`:`success`,t,t,c)}catch(e){return _([],`unavailable`,t,null,`NASA EONET fetch failed: ${e instanceof Error?e.message:`unknown error`}.`)}}async function ee(e={}){return ae([],`unavailable`,(e.now??(()=>new Date))().toISOString(),null,n)}async function l(e={}){let t=(e.now??(()=>new Date))().toISOString(),n=()=>new Date(t),r={...e.usgsEarthquakes??{}},i={...e.nasaEonet??{}},a={};r.now===void 0&&(r.now=n),i.now===void 0&&(i.now=n),a.now===void 0&&(a.now=n);let[o,l,u]=await Promise.all([s(r).then(f,e=>p(`usgs-earthquakes`,t,`USGS Earthquakes adapter failed before returning Source Status: ${h(e)}.`)),c(i).then(f,e=>p(`nasa-eonet`,t,`NASA EONET adapter failed before returning Source Status: ${h(e)}.`)),ee(a).then(f,e=>p(`gdacs`,t,`GDACS adapter failed before returning Source Status: ${h(e)}.`))]),ne=e.previousSourceStatuses??[],d=[o.sourceStatus,l.sourceStatus,u.sourceStatus].map(e=>te(e,ne));return{incidents:[...o.incidents,...l.incidents,...u.incidents].sort(ie),sourceStatuses:d,sourceStatusSummary:re(d),refreshedAt:t}}function te(e,t){if(e.lastSuccessfulAt!==null)return e;let n=t.find(t=>t.publicFeed===e.publicFeed)?.lastSuccessfulAt??null;return n===null||m([n])===null?e:{...e,lastSuccessfulAt:n}}function u(e={}){let n=new URL(t);return n.searchParams.set(`status`,`open`),n.searchParams.set(`limit`,String(ue(e.limit,50))),n.toString()}function ne(e){let t=de(e.severityLabel??null),n=b(e.severityScore??null);if(n!==null)return{severityScore:n,severityLabel:x(n)};let r=t===null?pe(e.category):fe(t);return{severityScore:r,severityLabel:t??x(r)}}function d(e,t={}){let n=S(t.categories),r=S(t.sources),i=S(t.severityLabels),a=ge(t.minSeverityScore??null),o=ge(t.maxSeverityScore??null),s=_e(t.text??null);return e.filter(e=>!(n!==null&&!n.has(e.category)||r!==null&&!r.has(e.source)||i!==null&&(e.severityLabel===null||!i.has(e.severityLabel))||a!==null&&(e.severityScore===null||e.severityScore<a)||o!==null&&(e.severityScore===null||e.severityScore>o)||s.length>0&&!ve(e,s)))}function f(e){return{incidents:[...e.incidents],sourceStatus:e.sourceStatus}}function p(t,n,r){return{incidents:[],sourceStatus:{publicFeed:t,publicFeedName:e[t],state:`unavailable`,lastAttemptedAt:n,lastSuccessfulAt:null,message:r}}}function re(e){return{sourceCount:e.length,successCount:e.filter(e=>e.state===`success`).length,degradedCount:e.filter(e=>e.state===`degraded`).length,unavailableCount:e.filter(e=>e.state===`unavailable`).length,lastAttemptedAt:m(e.map(e=>e.lastAttemptedAt)),lastSuccessfulAt:m(e.flatMap(e=>e.lastSuccessfulAt===null?[]:[e.lastSuccessfulAt]))}}function ie(e,t){return Date.parse(t.updatedAt??t.startedAt)-Date.parse(e.updatedAt??e.startedAt)||e.id.localeCompare(t.id)}function m(e){let t=e.reduce((e,t)=>{let n=Date.parse(t);return Number.isFinite(n)&&(e===null||n>e)?n:e},null);return t===null?null:new Date(t).toISOString()}function h(e){return e instanceof Error?e.message:`unknown error`}function g(t,n,r,i,a){return{incidents:t,sourceStatus:{publicFeed:`usgs-earthquakes`,publicFeedName:e[`usgs-earthquakes`],state:n,lastAttemptedAt:r,lastSuccessfulAt:i,message:a}}}function _(t,n,r,i,a){return{incidents:t,sourceStatus:{publicFeed:`nasa-eonet`,publicFeedName:e[`nasa-eonet`],state:n,lastAttemptedAt:r,lastSuccessfulAt:i,message:a}}}function ae(t,n,r,i,a){return{incidents:t,sourceStatus:{publicFeed:`gdacs`,publicFeedName:e.gdacs,state:n,lastAttemptedAt:r,lastSuccessfulAt:i,message:a}}}function oe(e){return!O(e)||!Array.isArray(e.features)?null:e.features.filter(O)}function se(e){return!O(e)||!Array.isArray(e.events)?null:e.events.filter(O)}function ce(){return typeof globalThis.fetch==`function`?globalThis.fetch.bind(globalThis):null}function le(e){let t=typeof e.status==`number`?String(e.status):`an unsuccessful status`,n=T(e.statusText);return n===null?t:`${t} ${n}`}function ue(e,t){return typeof e==`number`&&Number.isInteger(e)&&e>0?e:t}function v(e){if(e==null||e===``)return null;let t=e instanceof Date?e:new Date(e);return Number.isNaN(t.getTime())?null:t.toISOString()}function y(e){if(e==null)return null;let{latitude:t,longitude:n}=e;return!Number.isFinite(t)||!Number.isFinite(n)||t<-90||t>90||n<-180||n>180?null:{latitude:t,longitude:n}}function b(e){return e===null||!Number.isFinite(e)?null:Math.min(100,Math.max(0,Math.round(e*10)/10))}function de(e){switch(C(e)?.toLowerCase()){case`minor`:return`minor`;case`moderate`:return`moderate`;case`strong`:return`strong`;case`major`:return`major`;default:return null}}function fe(e){switch(e){case`major`:return 85;case`strong`:return 60;case`moderate`:return 40;case`minor`:return 15}}function x(e){return e>=70?`major`:e>=50?`strong`:e>=30?`moderate`:`minor`}function pe(e){switch(e){case`wildfire`:return 65;case`severe_storm`:case`volcano`:case`flood`:return 60;case`drought`:return 45;case`sea_lake_ice`:case`dust_haze`:return 35;case`earthquake`:return 40;case`other`:return 20}}function me(e){return e===null?null:b(e*10)}function he(e){return e===null?null:x(e*10)}function ge(e){return b(e)}function S(e){return!Array.isArray(e)||e.length===0?null:new Set(e)}function _e(e){return C(e)?.toLowerCase().split(/\s+/u)??[]}function ve(e,t){let n=[e.id,e.title,e.category,e.source,e.sourceName,e.sourceUrl,e.severityLabel,e.rawSource.originalId,e.rawSource.publicFeedName].flatMap(e=>e===null?[]:[e]).join(` `).toLowerCase();return t.every(e=>n.includes(e))}function C(e){if(e===null)return null;let t=e.trim();return t.length===0?null:t}function w(e){let t=C(e??null);if(t===null)return null;try{let e=new URL(t);return e.protocol===`http:`||e.protocol===`https:`?e.toString():null}catch{return null}}function T(e){return typeof e==`string`&&e.trim().length>0?e.trim():null}function E(e){return typeof e==`number`&&Number.isFinite(e)?e:null}function D(e){return typeof e==`string`||typeof e==`number`||e instanceof Date?e:null}function ye(e){if(!Array.isArray(e)||e.length<2)return null;let t=E(e[0]),n=E(e[1]);return n===null||t===null?null:y({latitude:n,longitude:t})}function be(e){if(!Array.isArray(e))return null;let t=e.flatMap(e=>{let t=v(D(e.date));return t===null?[]:[{geometry:e,timestamp:t,time:new Date(t).getTime()}]}),n=t[0];if(n===void 0)return null;let r=n,i=n;for(let e of t)e.time<r.time&&(r=e),e.time>i.time&&(i=e);return{startedAt:r.timestamp,updatedAt:i.timestamp===r.timestamp?null:i.timestamp,currentGeometry:i.geometry}}function xe(e,t){let n=e.flatMap(e=>{let t=v(e);return t===null?[]:[t]});if(n.length===0)return null;let r=n.reduce((e,t)=>new Date(t).getTime()>new Date(e).getTime()?t:e);return r===t?null:r}function Se(e){let t=Ce(e);return t===null?null:y({latitude:t[1],longitude:t[0]})}function Ce(e){if(!Array.isArray(e))return null;if(e.length>=2&&typeof e[0]==`number`&&typeof e[1]==`number`)return[e[0],e[1]];for(let t of e){let e=Ce(t);if(e!==null)return e}return null}function we(e){switch(T(e)){case`wildfires`:return`wildfire`;case`severeStorms`:return`severe_storm`;case`volcanoes`:return`volcano`;case`floods`:return`flood`;case`seaLakeIce`:return`sea_lake_ice`;case`drought`:return`drought`;case`dustHaze`:return`dust_haze`;default:return`other`}}function Te(e){if(!Array.isArray(e))return null;for(let t of e){let e=w(T(t.url));if(e!==null)return e}return null}function O(e){return typeof e==`object`&&!!e}var Ee=[`earthquake`,`wildfire`,`severe_storm`,`volcano`,`flood`,`sea_lake_ice`,`drought`,`dust_haze`,`other`],De=[`minor`,`moderate`,`strong`,`major`],Oe=new Set([`degraded`,`unavailable`]),ke=3.5,k=5.5,Ae=3,je=97,Me=4,Ne=96;function Pe(e,t={}){let n=d(e.incidents,t),r=e.sourceStatuses.some(e=>Oe.has(e.state));return{title:`Global Crisis Observatory`,refreshedAt:e.refreshedAt,incidents:e.incidents,filteredIncidentSet:n,mapMarkers:Ke(n.flatMap(Ge)),sourceStatuses:e.sourceStatuses,metrics:Ue(e,n),filterOptions:We(e.incidents),hasIncidents:e.incidents.length>0,hasFilteredIncidentSet:n.length>0,hasDegradedSourceStatus:r}}function Fe(e,t){return t!==null&&e.some(e=>e.id===t)?t:null}function Ie(e,t){return t===null?null:e.find(e=>e.id===t)??null}function A(e){if(e===null)return`Not yet available`;let t=new Date(e);return Number.isNaN(t.getTime())?`Unknown time`:new Intl.DateTimeFormat(`en`,{dateStyle:`medium`,timeStyle:`short`,timeZone:`UTC`}).format(t)}function j(e){return e.split(`_`).map(e=>e.charAt(0).toUpperCase()+e.slice(1)).join(` `)}function Le(e){return e.charAt(0).toUpperCase()+e.slice(1)}function Re(e){let t=[],n=Qe(e);return n!==null&&t.push({label:`Earthquake magnitude`,value:$e(n),sourceName:e.sourceName}),t}function ze(e){let t=Re(e);return{title:e.title,categoryLabel:j(e.category),severityText:Be(e),locationText:Ve(e),startedText:A(e.startedAt),updatedText:A(e.updatedAt),sourceLinkText:e.sourceUrl===null?`Source link unavailable from ${e.sourceName}.`:`Open source attribution`,sourceRecordText:He(e),metricFields:t,metricFallbackText:t.length===0?`No event-specific metrics were published by ${e.sourceName} for this Incident.`:null}}function Be(e){return`${e.severityLabel??`unscored`}${e.severityScore===null?``:` · ${e.severityScore}`}`}function Ve(e){return e.coordinates===null?`Location unavailable`:`${e.coordinates.latitude.toFixed(4)}, ${e.coordinates.longitude.toFixed(4)}`}function He(e){let t=e.rawSource.originalId===null?`source record ID unavailable`:`source record ${e.rawSource.originalId}`;return`${e.rawSource.publicFeedName} ${t} · Retrieved ${A(e.rawSource.retrievedAt)}`}function Ue(e,t){let n=e.sourceStatusSummary,r=n.degradedCount+n.unavailableCount;return[{label:`Filtered Incident Set`,value:String(t.length),detail:`${e.incidents.length} total Incidents from reachable Public Feeds`,tone:t.length>0?`steady`:`attention`},{label:`Public Feeds Online`,value:`${n.successCount}/${n.sourceCount}`,detail:r===0?`All Source Status checks are successful`:`Some Source Status checks need attention`,tone:r===0?`steady`:`attention`},{label:`Source Status Attention`,value:String(r),detail:`${n.degradedCount} degraded, ${n.unavailableCount} unavailable`,tone:n.unavailableCount>0?`critical`:r>0?`attention`:`steady`},{label:`Last Refresh`,value:A(e.refreshedAt),detail:`Latest successful refresh: ${A(n.lastSuccessfulAt)}`,tone:n.lastSuccessfulAt===null?`attention`:`steady`}]}function We(e){let t=new Set,n=new Map,r=new Set;for(let i of e)t.add(i.category),n.set(i.source,i.sourceName),i.severityLabel!==null&&r.add(i.severityLabel);return{categories:Ee.filter(e=>t.has(e)),sources:[...n.entries()].map(([e,t])=>({id:e,name:t})).sort((e,t)=>e.name.localeCompare(t.name)),severityLabels:De.filter(e=>r.has(e))}}function Ge(e){return e.coordinates===null?[]:[{id:e.id,title:e.title,category:e.category,source:e.source,sourceName:e.sourceName,latitude:e.coordinates.latitude,longitude:e.coordinates.longitude,severityScore:e.severityScore,severityLabel:e.severityLabel,leftPercent:Ze((e.coordinates.longitude+180)/360*100,Ae,je),topPercent:Ze((90-e.coordinates.latitude)/180*100,Me,Ne)}]}function Ke(e){let t=[];for(let n of e)t.push(qe(n,t));return t}function qe(e,t){let n=null,r=1/0;for(let i of Je(e)){let e=t.filter(e=>Xe(i,e)).length;if(e===0)return i;e<r&&(n=i,r=e)}return n??e}function Je(e){let t=[e];for(let n=Me;n<=Ne;n+=k)for(let r=Ae;r<=je;r+=ke)t.push({...e,leftPercent:Number(r.toFixed(6)),topPercent:Number(n.toFixed(6))});return t.sort((t,n)=>Ye(t,e)-Ye(n,e))}function Ye(e,t){return(e.leftPercent-t.leftPercent)**2+(e.topPercent-t.topPercent)**2}function Xe(e,t){return Math.abs(e.leftPercent-t.leftPercent)<ke&&Math.abs(e.topPercent-t.topPercent)<k}function Ze(e,t,n){return Math.min(n,Math.max(t,e))}function Qe(e){if(e.source!==`usgs-earthquakes`||!et(e.rawSource.payload))return null;let t=e.rawSource.payload.properties;if(!et(t))return null;let n=t.mag;return typeof n==`number`&&Number.isFinite(n)?n:null}function $e(e){return Number.isInteger(e)?e.toString():e.toFixed(1)}function et(e){return typeof e==`object`&&!!e}var tt=`/api/ai-briefing`,nt=12,M=class extends Error{constructor(e){super(e),this.name=`AiBriefingError`}},rt=class extends M{constructor(e){super(e),this.name=`AiBriefingConfigurationError`}},N=class extends M{constructor(e){super(e),this.name=`AiBriefingRequestError`}};function it(e){if(e===null)throw new N(`Select an Incident before requesting an AI Briefing for one Incident.`);return ot({selectedIncident:e,filteredIncidentSet:[]})}function at(e,t={}){return ot({selectedIncident:null,filteredIncidentSet:e,filters:t})}function ot(e){let t={situationSummary:!0,likelyImpactConsiderations:!0,responsePriorityRecommendations:!0,uncertaintyNotes:!0},n=`Use only the public Incident fields in this payload. Do not request PII, confidential context, or private operational data.`;return e.selectedIncident===null?{requestedOutput:t,publicDataNotice:n,scope:{kind:`filtered_incident_set`,label:`Filtered Incident Set`,incidentCount:e.filteredIncidentSet.length,filters:dt(e.filters??{}),incidents:e.filteredIncidentSet.slice(0,nt).map(ut)}}:{requestedOutput:t,publicDataNotice:n,scope:{kind:`selected_incident`,label:`selected Incident`,incident:ut(e.selectedIncident)}}}function st(e){let t=e.scope.kind===`selected_incident`?[e.scope.incident]:e.scope.incidents;if(t.length===0)throw new N(`The AI Briefing needs at least one public Incident to summarize.`);for(let e of t)if(e.id.trim()===``||e.title.trim()===``||e.startedAt.trim()===``)throw new N(`The AI Briefing payload contains an Incident missing required public fields.`);let n=new Set([`rawsource`,`payload`,`email`,`phone`,`pii`,`confidentialcontext`,`privatecontext`,`text`]);for(let t of F(e))if(n.has(t.toLowerCase()))throw new N(`The AI Briefing payload contains a non-public field: `+t+`.`)}async function ct(e,t={}){st(e);let n=t.fetcher??ht();if(n===null)throw new rt(`AI Briefing requests are unavailable because fetch is not available. The Global Crisis Dashboard remains interactive.`);let r=await n(tt,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({payload:e})}),i=await ft(r);if(!r.ok){let e=pt(i)??`AI Briefing generation failed. The Global Crisis Dashboard remains interactive.`;throw r.status===401||r.status===403||mt(i)===`configuration`?new rt(e):new N(e)}return lt(i)}function lt(e){if(!I(e))throw new N(`AI Briefing generation returned an unexpected response.`);let t=I(e.briefing)?e.briefing:e,n=P(t.situationSummary),r=P(t.impactConsiderations),i=P(t.responsePriorityRecommendation),a=gt(t.uncertaintyNotes);if(n===null||r===null||i===null||a.length===0)throw new N(`AI Briefing generation returned an incomplete response.`);return{situationSummary:n,impactConsiderations:r,responsePriorityRecommendation:i,uncertaintyNotes:a}}function ut(e){return{id:e.id,title:e.title,category:e.category,source:e.source,sourceName:e.sourceName,sourceUrl:e.sourceUrl,coordinates:e.coordinates,startedAt:e.startedAt,updatedAt:e.updatedAt,severityScore:e.severityScore,severityLabel:e.severityLabel,sourceRecord:{publicFeed:e.rawSource.publicFeed,publicFeedName:e.rawSource.publicFeedName,originalId:e.rawSource.originalId,retrievedAt:e.rawSource.retrievedAt}}}function dt(e){let t={};return e.categories!==void 0&&e.categories.length>0&&(t.categories=[...e.categories]),e.sources!==void 0&&e.sources.length>0&&(t.sources=[...e.sources]),e.severityLabels!==void 0&&e.severityLabels.length>0&&(t.severityLabels=[...e.severityLabels]),typeof e.minSeverityScore==`number`&&Number.isFinite(e.minSeverityScore)&&(t.minSeverityScore=e.minSeverityScore),typeof e.maxSeverityScore==`number`&&Number.isFinite(e.maxSeverityScore)&&(t.maxSeverityScore=e.maxSeverityScore),t}async function ft(e){try{return await e.json()}catch{return null}}function pt(e){return I(e)?P(e.error)??P(e.message):null}function mt(e){return I(e)?P(e.code):null}function ht(){return typeof globalThis.fetch==`function`?globalThis.fetch.bind(globalThis):null}function P(e){return typeof e==`string`&&e.trim().length>0?e.trim():null}function gt(e){if(typeof e==`string`){let t=e.trim();return t===``?[]:[t]}return Array.isArray(e)?e.flatMap(e=>P(e)===null?[]:[String(e).trim()]):[]}function F(e){return Array.isArray(e)?e.flatMap(F):I(e)?Object.entries(e).flatMap(([e,t])=>[e,...F(t)]):[]}function I(e){return typeof e==`object`&&!!e}var L=`global-crisis-dashboard.savedEvents.v1`,_t=new Set([`earthquake`,`wildfire`,`severe_storm`,`volcano`,`flood`,`sea_lake_ice`,`drought`,`dust_haze`,`other`]),vt=new Set([`usgs-earthquakes`,`nasa-eonet`,`gdacs`]),yt=new Set([`minor`,`moderate`,`strong`,`major`]);function bt(e,t=new Date().toISOString()){return{version:1,id:e.id,title:e.title,category:e.category,source:e.source,sourceName:e.sourceName,sourceUrl:e.sourceUrl,coordinates:e.coordinates===null?null:{...e.coordinates},startedAt:e.startedAt,updatedAt:e.updatedAt,severityScore:e.severityScore,severityLabel:e.severityLabel,originalSourceId:e.rawSource.originalId,sourceRetrievedAt:e.rawSource.retrievedAt,savedAt:t}}function R(e=H()){if(e===null)return[];let t;try{t=e.getItem(L)}catch{return[]}if(t===null)return[];let n;try{n=JSON.parse(t)}catch{return[]}return Array.isArray(n)?B(Tt(n.filter(Et))):[]}function xt(e,t=H()){let n=B(Tt(e.filter(Et)));if(t===null)return n;try{n.length===0?t.removeItem(L):t.setItem(L,JSON.stringify(n))}catch{return n}return n}function St(e,t={}){let n=Object.hasOwn(t,`storage`)?t.storage??null:H(),r=bt(e,t.savedAt??new Date().toISOString());return xt([r,...R(n).filter(e=>e.id!==r.id)],n)}function Ct(e,t=H()){return xt(R(t).filter(t=>t.id!==e),t)}function z(e,t){return e.some(e=>e.id===t)}function wt(e,t){let n=new Map(t.map(e=>[e.id,e]));return B(e).map(e=>{let t=n.get(e.id)??null;return{savedEvent:e,liveIncident:t,isLive:t!==null,statusText:t===null?`No longer live in the current Public Feed refresh; showing saved source details.`:`Live in the current Public Feed refresh.`}})}function Tt(e){let t=new Map;for(let n of e){let e=t.get(n.id);(e===void 0||Date.parse(n.savedAt)>=Date.parse(e.savedAt))&&t.set(n.id,n)}return[...t.values()]}function B(e){return[...e].sort((e,t)=>{let n=Date.parse(t.savedAt)-Date.parse(e.savedAt);return n===0?e.title.localeCompare(t.title):n})}function Et(e){return Dt(e)?e.version===1&&typeof e.id==`string`&&e.id.trim()!==``&&typeof e.title==`string`&&e.title.trim()!==``&&typeof e.category==`string`&&_t.has(e.category)&&typeof e.source==`string`&&vt.has(e.source)&&typeof e.sourceName==`string`&&e.sourceName.trim()!==``&&V(e.sourceUrl)&&jt(e.coordinates)&&Ot(e.startedAt)&&V(e.updatedAt)&&kt(e.severityScore)&&At(e.severityLabel)&&V(e.originalSourceId)&&V(e.sourceRetrievedAt)&&Ot(e.savedAt):!1}function Dt(e){return typeof e==`object`&&!!e&&!Array.isArray(e)}function V(e){return e===null||typeof e==`string`}function Ot(e){return typeof e==`string`&&e.trim()!==``&&!Number.isNaN(Date.parse(e))}function kt(e){return e===null||typeof e==`number`&&Number.isFinite(e)}function At(e){return e===null||typeof e==`string`&&yt.has(e)}function jt(e){return e===null?!0:Dt(e)?typeof e.latitude==`number`&&Number.isFinite(e.latitude)&&e.latitude>=-90&&e.latitude<=90&&typeof e.longitude==`number`&&Number.isFinite(e.longitude)&&e.longitude>=-180&&e.longitude<=180:!1}function H(){try{return globalThis.localStorage===void 0?null:globalThis.localStorage}catch{return null}}var Mt=`global-crisis-dashboard.visibilityMode.v1`,U=[`light`,`dark`,`high-contrast`];function W(e){return typeof e==`string`&&U.includes(e)}function Nt(e=Rt()){if(e===null)return`dark`;try{let t=e.getItem(Mt);return W(t)?t:`dark`}catch{return`dark`}}function Pt(e,t=Rt()){let n=W(e)?e:`dark`;if(t===null)return n;try{t.setItem(Mt,n)}catch{return n}return n}function Ft(e){switch(e){case`light`:return`Light`;case`dark`:return`Dark`;case`high-contrast`:return`High contrast`}}function It(e){return`Current Visibility Mode: ${Ft(e)}`}function Lt(e,t=zt()){let n=W(e)?e:`dark`;return t!==null&&(t.documentElement.dataset.visibilityMode=n),n}function Rt(){try{return globalThis.localStorage===void 0?null:globalThis.localStorage}catch{return null}}function zt(){try{return globalThis.document===void 0?null:globalThis.document}catch{return null}}var Bt=document.querySelector(`#app`);if(Bt===null)throw Error(`Global Crisis Observatory root element was not found.`);var G=Bt,K={collection:null,filters:{},selectedIncidentId:null,savedEvents:R(),visibilityMode:Nt(),aiBriefing:{status:`idle`,activeScope:null,output:null,errorMessage:null},isLoading:!0,loadError:null},q=0;Lt(K.visibilityMode),J(),Vt();async function Vt(){K.isLoading=!0,K.loadError=null,J();try{K.collection=await l(K.collection===null?{}:{previousSourceStatuses:K.collection.sourceStatuses})}catch(e){K.collection=null,K.loadError=e instanceof Error?e.message:`The incident pipeline could not be refreshed.`}finally{K.isLoading=!1,J()}}function J(){if(K.collection===null){G.innerHTML=Ht(K),on();return}let e=Pe(K.collection,K.filters),t=Fe(e.filteredIncidentSet,K.selectedIncidentId);K.selectedIncidentId=t;let n=t===null?null:e.filteredIncidentSet.find(e=>e.id===t)??null,r=wt(K.savedEvents,e.incidents);G.innerHTML=`
    <main class="dashboard-shell" aria-labelledby="dashboard-title">
      ${Ut(e.refreshedAt,K.isLoading,e.hasDegradedSourceStatus,K.visibilityMode)}
      ${Wt(e.metrics)}
      <section class="command-grid" aria-label="Global Crisis Dashboard layout">
        <section class="map-panel" aria-labelledby="map-title">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Globe Map</p>
              <h2 id="map-title">Primary geographic Incident view</h2>
              <p class="panel-subtitle">Incident Markers are projected by latitude and longitude with Public Feed attribution visible on the map.</p>
            </div>
          </div>
          ${Gt(e.mapMarkers,e.hasFilteredIncidentSet,n,K.savedEvents)}
        </section>
        <aside class="filters-panel" aria-labelledby="filters-title">
          <div class="panel-heading">
            <p class="eyebrow">Filters</p>
            <h2 id="filters-title">Refine the Filtered Incident Set</h2>
          </div>
          ${Kt(e.filterOptions,K.filters)}
        </aside>
        <section class="feed-panel" aria-labelledby="feed-title">
          <div class="panel-heading">
            <p class="eyebrow">Incident Feed</p>
            <h2 id="feed-title">Live public Incidents</h2>
          </div>
          ${qt(e.filteredIncidentSet,e.hasIncidents,t,K.savedEvents)}
        </section>
        <div class="dashboard-side-stack">
          <aside class="detail-panel" aria-labelledby="incident-detail-title">
            ${Yt(n,K.savedEvents)}
          </aside>
          <section class="ai-briefing-panel" aria-labelledby="ai-briefing-title">
            ${Zt(K.aiBriefing,n,e.filteredIncidentSet)}
          </section>
          <aside class="status-panel" aria-labelledby="source-status-title">
            <div class="panel-heading">
              <p class="eyebrow">Source Status</p>
              <h2 id="source-status-title">Public Feed freshness</h2>
            </div>
            ${Xt(e.sourceStatuses)}
          </aside>
        </div>
        <section class="saved-events-panel" aria-labelledby="saved-events-title">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Saved Events</p>
              <h2 id="saved-events-title">Saved Events View</h2>
            </div>
            <span class="saved-events-count">${r.length}</span>
          </div>
          ${$t(r)}
        </section>
      </section>
    </main>
  `,on()}function Ht(e){let t=e.loadError===null?`Loading public Incidents from the adapter pipeline.`:e.loadError,n=e.loadError===null?`loading-card`:`loading-card loading-card--error`;return`
    <main class="dashboard-shell" aria-labelledby="dashboard-title">
      ${Ut(null,e.isLoading,e.loadError!==null,e.visibilityMode)}
      <section class="${n}" role="status">
        <p class="eyebrow">Incident pipeline</p>
        <h2>${$(e.loadError===null?`Connecting to Public Feeds`:`Public Feed refresh failed`)}</h2>
        <p>${$(t)}</p>
        <button class="control-button" type="button" data-refresh>Refresh Source Status</button>
      </section>
    </main>
  `}function Ut(e,t,n,r){let i=t?`Refreshing`:n?`Degraded`:`Operational`;return`
    <header class="hero">
      <div>
        <p class="eyebrow">Global Crisis Dashboard</p>
        <h1 id="dashboard-title">Global Crisis Observatory</h1>
        <p class="hero-copy">A Global Crisis Dashboard view of normalized public natural-disaster and environmental Incidents.</p>
      </div>
      <div class="hero-status" data-state="${$(i.toLowerCase())}">
        <span>${$(i)}</span>
        <small>${$(e===null?`Awaiting first refresh`:`Refreshed ${A(e)} UTC`)}</small>
        <button class="control-button" type="button" data-refresh>${t?`Refreshing…`:`Refresh`}</button>
      </div>
      <section class="settings-control" aria-labelledby="settings-control-title" data-current-visibility-mode="${$(r)}">
        <p class="eyebrow" id="settings-control-title">Settings Control</p>
        <label for="visibility-mode">Visibility Mode</label>
        <select id="visibility-mode" name="visibility-mode" data-visibility-mode-control aria-describedby="visibility-mode-help">
          ${U.map(e=>`<option value="${$(e)}" ${e===r?`selected`:``}>${$(Ft(e))}</option>`).join(``)}
        </select>
        <span class="visibility-mode-current" aria-live="polite">${$(It(r))}</span>
        <small id="visibility-mode-help">Applies to navigation, cards, controls, Incident Detail, Saved Events View, AI Briefing, and Globe Map UI.</small>
      </section>
    </header>
  `}function Wt(e){return`
    <section class="metrics-grid" aria-label="summary metrics">
      ${e.map(e=>`
            <article class="metric-card" data-tone="${$(e.tone)}">
              <span>${$(e.label)}</span>
              <strong>${$(e.value)}</strong>
              <p>${$(e.detail)}</p>
            </article>
          `).join(``)}
    </section>
  `}function Gt(e,t,n,r){if(!t)return`
      <div class="map-canvas map-canvas--empty">
        <p>No Incidents match the current filters.</p>
      </div>
    `;let i=Ie(e,n?.id??null),a=i===null?``:` style="--map-focus-x: ${i.leftPercent.toFixed(2)}%; --map-focus-y: ${i.topPercent.toFixed(2)}%;"`,o=i===null?``:` map-canvas--focused`,s=Z(e.map(e=>({source:e.source,sourceName:e.sourceName}))),c=n!==null&&n.coordinates===null?`<p class="map-note">Selected Incident ${$(n.title)} has no coordinates to focus on.</p>`:i===null?e.length===0?`<p class="map-note">The Filtered Incident Set has no coordinates yet.</p>`:`<p class="map-note">Select an Incident Marker or feed row to focus the Globe Map.</p>`:`<p class="map-note">Globe Map focused on ${$(i.title)}.</p>`;return`
    <div class="map-canvas${o}" role="group" aria-label="Map area with styled Incident markers"${a}>
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
        ${e.map(e=>{let t=n?.id===e.id,r=e.severityLabel??`unscored`;return`
              <button
                class="map-marker map-marker--${$(e.category)} map-marker--severity-${$(r)}${t?` map-marker--selected`:``}"
                type="button"
                style="left: ${e.leftPercent.toFixed(2)}%; top: ${e.topPercent.toFixed(2)}%;"
                title="${$(`${e.title} from ${e.sourceName}`)}"
                aria-label="Select ${$(e.title)} from ${$(e.sourceName)}"
                aria-pressed="${t?`true`:`false`}"
                data-select-incident="${$(e.id)}"
                data-selection-surface="map"
                data-source="${$(e.source)}"
              >
                <span class="sr-only">${$(e.title)}</span>
                <span class="map-marker-source-abbr" aria-hidden="true">${$(rn(e.source,e.sourceName))}</span>
              </button>
            `}).join(``)}
      </div>
      <div class="map-source-legend" aria-label="Visible Public Feed attribution">
        <span class="map-source-legend__label">Visible Public Feeds</span>
        <div>
          ${s.length===0?`<span class="fallback-text">No geocoded Incidents</span>`:s.map(e=>X(e.source,e.sourceName,`map`)).join(``)}
        </div>
      </div>
      ${c}
      ${n===null?``:`<div class="map-selection-actions" aria-label="Globe Map selected Incident Saved Event controls">
              ${Y(n,z(r,n.id),`map`)}
            </div>`}
    </div>
  `}function Kt(e,t){return`
    <form class="filters-form" data-filters>
      <label>
        Text search
        <input name="text" type="search" value="${$(t.text??``)}" placeholder="Search title or source" />
      </label>
      <label>
        Category
        <select name="category">
          <option value="">All categories</option>
          ${e.categories.map(e=>`<option value="${$(e)}" ${t.categories?.includes(e)?`selected`:``}>${$(j(e))}</option>`).join(``)}
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
  `}function qt(e,t,n,r){return t?e.length===0?`<div class="empty-state"><strong>No matching Incidents.</strong><p>Adjust filters to expand the Filtered Incident Set.</p></div>`:`
    <div class="incident-list">
      ${e.map(e=>Jt(e,e.id===n,z(r,e.id))).join(``)}
    </div>
  `:`<div class="empty-state"><strong>No Incidents available.</strong><p>Reachable Public Feeds returned no normalized Incidents.</p></div>`}function Jt(e,t,n){let r=e.severityLabel??`unscored`,i=e.coordinates===null?`Coordinates unavailable`:`${e.coordinates.latitude.toFixed(2)}, ${e.coordinates.longitude.toFixed(2)}`;return`
    <article
      id="incident-${$(e.id)}"
      class="incident-card incident-card--${$(e.category)} incident-card--severity-${$(r)}${t?` incident-card--selected`:``}"
      data-incident-id="${$(e.id)}"
      aria-current="${t?`true`:`false`}"
    >
      <div>
        <button class="incident-select-button" type="button" data-select-incident="${$(e.id)}" data-selection-surface="feed">
          <span class="category-pill category-pill--${$(e.category)}">${$(j(e.category))}</span>
          <span class="severity-pill severity-pill--${$(r)}">${$(r)}${e.severityScore===null?``:` · ${e.severityScore}`}</span>
          ${X(e.source,e.sourceName)}
          <span class="incident-select-title">${$(e.title)}</span>
        </button>
      </div>
      <dl>
        <div><dt>Public Feed</dt><dd>${$(e.sourceName)}</dd></div>
        <div><dt>Severity Score</dt><dd>${$(r)}${e.severityScore===null?``:` · ${e.severityScore}`}</dd></div>
        <div><dt>Started</dt><dd>${$(A(e.startedAt))}</dd></div>
        <div><dt>Coordinates</dt><dd>${$(i)}</dd></div>
      </dl>
      <div class="incident-card-actions">
        ${Y(e,n,`feed`)}
        ${e.sourceUrl===null?``:`<a href="${$(e.sourceUrl)}" target="_blank" rel="noreferrer">Open source attribution</a>`}
      </div>
    </article>
  `}function Yt(e,t){if(e===null)return`
      <div class="panel-heading">
        <p class="eyebrow">Incident Detail</p>
        <h2 id="incident-detail-title">No selected Incident</h2>
      </div>
      <div class="empty-state">
        <strong>Select an Incident</strong>
        <p>Choose an Incident from the feed or map to inspect source-attributed details.</p>
      </div>
    `;let n=e.severityLabel??`unscored`,r=ze(e),i=e.sourceUrl===null?`<span class="fallback-text">${$(r.sourceLinkText)}</span>`:`<a href="${$(e.sourceUrl)}" target="_blank" rel="noreferrer">${$(r.sourceLinkText)}</a>`,a=r.metricFields,o=z(t,e.id);return`
    <div class="panel-heading">
      <p class="eyebrow">Incident Detail</p>
      <h2 id="incident-detail-title">Selected Incident</h2>
    </div>
    <article class="incident-detail-card incident-detail-card--${$(e.category)}" data-selected-incident-id="${$(e.id)}">
      <div class="incident-detail-card__header">
        <span class="category-pill category-pill--${$(e.category)}">${$(j(e.category))}</span>
        <span class="severity-pill severity-pill--${$(n)}">${$(Be(e))}</span>
        ${X(e.source,e.sourceName)}
        <span class="saved-event-status">${tn(o)}</span>
      </div>
      <h3>${$(r.title)}</h3>
      <dl class="incident-detail-grid">
        <div><dt>Public Feed</dt><dd>${$(e.sourceName)}</dd></div>
        <div><dt>Category</dt><dd>${$(r.categoryLabel)}</dd></div>
        <div><dt>Severity Score</dt><dd>${$(r.severityText)}</dd></div>
        <div><dt>Location</dt><dd>${$(r.locationText)}</dd></div>
        <div><dt>Started</dt><dd>${$(r.startedText)}</dd></div>
        <div><dt>Updated</dt><dd>${$(r.updatedText)}</dd></div>
        <div><dt>Source link</dt><dd>${i}</dd></div>
        <div><dt>Source record</dt><dd>${$(r.sourceRecordText)}</dd></div>
      </dl>
      <section class="incident-detail-metrics" aria-label="Event-specific metrics">
        <h4>Event-specific metrics</h4>
        ${a.length===0?`<p class="fallback-text">${$(r.metricFallbackText??``)}</p>`:`<dl>${a.map(e=>`<div><dt>${$(e.label)}</dt><dd>${$(e.value)} <span>from ${$(e.sourceName)}</span></dd></div>`).join(``)}</dl>`}
      </section>
      <div class="incident-detail-actions">
        ${Y(e,o,`detail`)}
      </div>
    </article>
  `}function Xt(e){return`
    <div class="source-status-list">
      ${e.map(e=>`
            <article class="source-status-card" data-state="${$(e.state)}">
              <div class="source-status-card__header">
                <strong>${$(e.publicFeedName)}</strong>
                <span>${$(Le(e.state))}</span>
              </div>
              <p>${$(e.message??`Public Feed refreshed successfully.`)}</p>
              <div class="source-status-card__timestamps">
                <small>Last attempted refresh: ${$(A(e.lastAttemptedAt))} UTC</small>
                <small>Latest successful refresh: ${$(A(e.lastSuccessfulAt))}${e.lastSuccessfulAt===null?``:` UTC`}</small>
              </div>
            </article>
          `).join(``)}
    </div>
  `}function Zt(e,t,n){let r=t===null||e.status===`loading`,i=n.length===0||e.status===`loading`,a=e.activeScope===`single-incident`?`selected Incident`:e.activeScope===`filtered-incident-set`?`Filtered Incident Set`:`no active request`;return`
    <div class="panel-heading">
      <div>
        <p class="eyebrow">AI Briefing</p>
        <h2 id="ai-briefing-title">Public-data AI Briefing</h2>
      </div>
    </div>
    <div class="ai-briefing-controls" aria-label="AI Briefing request controls">
      <button class="control-button" type="button" data-request-ai-briefing="single-incident" ${r?`disabled`:``}>
        Brief selected Incident
      </button>
      <button class="control-button control-button--secondary" type="button" data-request-ai-briefing="filtered-incident-set" ${i?`disabled`:``}>
        Brief Filtered Incident Set
      </button>
    </div>
    <p class="ai-briefing-privacy-note">
      Sends only public Incident fields from the dashboard. Do not enter PII, confidential context, or private operational data.
    </p>
    ${nn(t,n)}
    <div class="ai-briefing-status" role="status" aria-live="polite" data-state="${$(e.status)}">
      ${Qt(e,a)}
    </div>
  `}function Qt(e,t){return e.status===`loading`?`<p>Requesting an AI Briefing for the ${$(t)}…</p>`:e.status===`error`?`
      <div class="ai-briefing-error">
        <strong>AI Briefing unavailable</strong>
        <p>${$(e.errorMessage??`The AI Briefing request failed. The Global Crisis Dashboard remains interactive.`)}</p>
      </div>
    `:e.status===`ready`&&e.output!==null?`
      <article class="ai-briefing-output">
        <section>
          <h3>Situation summary</h3>
          <p>${$(e.output.situationSummary)}</p>
        </section>
        <section>
          <h3>Likely impact considerations</h3>
          <p>${$(e.output.impactConsiderations)}</p>
        </section>
        <section>
          <h3>Response Priority Recommendation</h3>
          <p>${$(e.output.responsePriorityRecommendation)}</p>
        </section>
        <section>
          <h3>Uncertainty Note</h3>
          <ul>
            ${e.output.uncertaintyNotes.map(e=>`<li>${$(e)}</li>`).join(``)}
          </ul>
        </section>
      </article>
    `:`<p>Choose a selected Incident or the current Filtered Incident Set to generate an AI Briefing.</p>`}function $t(e){return e.length===0?`<div class="empty-state"><strong>No Saved Events yet.</strong><p>Saved Incidents will persist here in browser local storage across refreshes on this machine.</p></div>`:`
    <div class="saved-events-list">
      ${e.map(en).join(``)}
    </div>
  `}function en(e){let t=e.savedEvent,n=t.severityLabel??`unscored`,r=t.coordinates===null?`Coordinates unavailable`:`${t.coordinates.latitude.toFixed(2)}, ${t.coordinates.longitude.toFixed(2)}`,i=[`Original source id: ${t.originalSourceId??`Unavailable`}`,`Source retrieved: ${A(t.sourceRetrievedAt)}`,`Saved: ${A(t.savedAt)}`].join(` · `),a=e.isLive?`<button class="control-button control-button--secondary" type="button" data-select-saved-event="${$(t.id)}">Revisit live Incident</button>`:`<span class="saved-event-stale-note">Live Incident unavailable</span>`;return`
    <article
      class="saved-event-card incident-card--${$(t.category)} incident-card--severity-${$(n)}"
      data-saved-event-id="${$(t.id)}"
      data-state="${e.isLive?`live`:`stale`}"
    >
      <div class="saved-event-card__header">
        <span class="category-pill category-pill--${$(t.category)}">${$(j(t.category))}</span>
        <span class="severity-pill severity-pill--${$(n)}">${$(n)}${t.severityScore===null?``:` · ${t.severityScore}`}</span>
        ${X(t.source,t.sourceName)}
        <span class="saved-event-status">${$(e.statusText)}</span>
      </div>
      <h3>${$(t.title)}</h3>
      <dl>
        <div><dt>Public Feed</dt><dd>${$(t.sourceName)}</dd></div>
        <div><dt>Started</dt><dd>${$(A(t.startedAt))}</dd></div>
        <div><dt>Updated</dt><dd>${$(A(t.updatedAt))}</dd></div>
        <div><dt>Coordinates</dt><dd>${$(r)}</dd></div>
      </dl>
      <p class="saved-event-source-detail">${$(i)}</p>
      <div class="saved-event-actions">
        ${a}
        <button class="control-button control-button--secondary" type="button" data-remove-saved-event="${$(t.id)}">Remove Saved Event</button>
        ${t.sourceUrl===null?``:`<a href="${$(t.sourceUrl)}" target="_blank" rel="noreferrer">Open saved source attribution</a>`}
      </div>
    </article>
  `}function Y(e,t,n){let r=$(e.id),i=n===`map`?`Globe Map selection`:n===`detail`?`Incident Detail`:`feed`,a=t?`unsave`:`save`,o=t?`Unsave Incident`:`Save Incident`,s=t?`control-button control-button--secondary`:`control-button`;return`
    <div class="saved-event-toggle" data-saved-state="${t?`saved`:`unsaved`}" data-save-surface="${n}">
      <span class="saved-event-status" aria-live="polite">${tn(t)}</span>
      <button
        class="${s}"
        type="button"
        data-toggle-saved-event="${r}"
        data-saved-event-action="${a}"
        data-save-surface="${n}"
        aria-label="${$(t?`Unsave ${e.title} from ${i}`:`Save ${e.title} from ${i} as a Saved Event`)}"
      >
        ${o}
      </button>
    </div>
  `}function tn(e){return e?`Saved Event`:`Not saved`}function nn(e,t){let n=e===null?Z(t.map(e=>({source:e.source,sourceName:e.sourceName}))):[{source:e.source,sourceName:e.sourceName}],r=e===null?`Filtered Incident Set includes ${t.length} public Incidents from ${n.length} Public Feeds.`:`Selected Incident source record: ${e.rawSource.originalId??`unavailable`}.`;return`
    <div class="ai-briefing-source-context" aria-label="AI Briefing source attribution">
      <span>AI Briefing source context</span>
      <div>
        ${n.length===0?`<span class="fallback-text">No source-attributed Incidents available</span>`:n.map(e=>X(e.source,e.sourceName)).join(``)}
      </div>
      <small>${$(r)}</small>
    </div>
  `}function X(e,t,n=`inline`){return`<span class="source-attribution source-attribution--${$(an(e))} source-attribution--${n}" title="${$(`Public Feed: ${t}`)}">
    <span class="source-attribution__abbr" aria-hidden="true">${$(rn(e,t))}</span>
    <span class="source-attribution__name">${$(t)}</span>
  </span>`}function Z(e){let t=new Map;for(let n of e)t.set(n.source,n.sourceName);return[...t.entries()].map(([e,t])=>({source:e,sourceName:t})).sort((e,t)=>e.sourceName.localeCompare(t.sourceName))}function rn(e,t){switch(e){case`usgs-earthquakes`:return`USGS`;case`nasa-eonet`:return`EONET`;case`gdacs`:return`GDACS`;default:{let e=t.split(/\s+/u).flatMap(e=>e.length===0?[]:[e[0].toUpperCase()]).join(``);return e.length===0?`SRC`:e.slice(0,6)}}}function an(e){return e.toLowerCase().replace(/[^a-z0-9-]/gu,`-`)}function on(){G.querySelector(`[data-visibility-mode-control]`)?.addEventListener(`change`,e=>{let t=e.currentTarget;if(!(t instanceof HTMLSelectElement))return;let n=t.value;U.includes(n)&&(K.visibilityMode=Pt(n),Lt(K.visibilityMode),J())}),G.querySelectorAll(`[data-refresh]`).forEach(e=>{e.addEventListener(`click`,()=>void Vt())}),G.querySelector(`[data-reset-filters]`)?.addEventListener(`click`,()=>{K.filters={},J()}),G.querySelectorAll(`[data-select-incident]`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.selectIncident??null;if(t===null)return;K.selectedIncidentId=t;let n=e.dataset.selectionSurface===`map`;J(),n&&un(t)})}),G.querySelectorAll(`[data-select-saved-event]`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.selectSavedEvent??null;t!==null&&(K.filters={},K.selectedIncidentId=t,J(),un(t))})}),G.querySelectorAll(`[data-toggle-saved-event]`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.toggleSavedEvent??null,n=e.dataset.savedEventAction;t===null||n!==`save`&&n!==`unsave`||ln(t,n)&&J()})}),G.querySelectorAll(`[data-remove-saved-event]`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.removeSavedEvent??null;t!==null&&(K.savedEvents=Ct(t),J())})}),G.querySelectorAll(`[data-request-ai-briefing]`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.requestAiBriefing;t!==`single-incident`&&t!==`filtered-incident-set`||sn(t)})}),G.querySelector(`[data-filters]`)?.addEventListener(`input`,e=>{let t=e.currentTarget;t instanceof HTMLFormElement&&(K.filters=dn(t),J())})}async function sn(e){if(K.collection===null)return;let t=Pe(K.collection,K.filters),n=Fe(t.filteredIncidentSet,K.selectedIncidentId),r=n===null?null:t.filteredIncidentSet.find(e=>e.id===n)??null;if(e===`single-incident`&&r===null){K.aiBriefing={status:`error`,activeScope:e,output:null,errorMessage:`Select an Incident before requesting an AI Briefing for one Incident.`},J();return}if(e===`filtered-incident-set`&&t.filteredIncidentSet.length===0){K.aiBriefing={status:`error`,activeScope:e,output:null,errorMessage:`The current Filtered Incident Set is empty. Adjust filters before requesting an AI Briefing.`},J();return}let i=e===`single-incident`?it(r):at(t.filteredIncidentSet,K.filters),a=++q;K.aiBriefing={status:`loading`,activeScope:e,output:null,errorMessage:null},J();try{let t=await ct(i);if(a!==q)return;K.aiBriefing={status:`ready`,activeScope:e,output:t,errorMessage:null}}catch(t){if(a!==q)return;K.aiBriefing={status:`error`,activeScope:e,output:null,errorMessage:fn(t)}}finally{a===q&&J()}}function cn(e){return K.collection?.incidents.find(t=>t.id===e)??null}function ln(e,t){if(t===`unsave`)return K.savedEvents=Ct(e),!0;let n=cn(e);return n===null?!1:(K.savedEvents=St(n),!0)}function un(e){G.querySelector(`[data-incident-id="${pn(e)}"]`)?.scrollIntoView({behavior:`smooth`,block:`nearest`})}function dn(e){let t=new FormData(e),n={},r=Q(t,`text`),i=Q(t,`category`),a=Q(t,`source`),o=Q(t,`severity`);return r!==``&&(n.text=r),i!==``&&(n.categories=[i]),a!==``&&(n.sources=[a]),o!==``&&(n.severityLabels=[o]),n}function Q(e,t){let n=e.get(t);return typeof n==`string`?n.trim():``}function fn(e){return e instanceof M?e.message:e instanceof Error?`${e.message} The Global Crisis Dashboard remains interactive.`:`AI Briefing generation failed. The Global Crisis Dashboard remains interactive.`}function pn(e){return globalThis.CSS?.escape(e)??e.replace(/["\\]/g,`\\$&`)}function $(e){return e.replace(/[&<>"]/g,e=>{switch(e){case`&`:return`&amp;`;case`<`:return`&lt;`;case`>`:return`&gt;`;case`"`:return`&quot;`;default:return e}})}