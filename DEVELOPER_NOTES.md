# Developer Notes

## GDACS Public Feed decision

Task P3-T4 probed the GDACS public RSS endpoint at `https://www.gdacs.org/xml/rss.xml` for the Global Crisis Dashboard.

Result: the endpoint returned RSS successfully from the server-side probe, but it did not advertise an `Access-Control-Allow-Origin` header. A later local proxy also found that GDACS returns `406` for narrow RSS `Accept` headers.

Chosen behavior: GDACS is fetched through the Vite Public Feed proxy at `/api/public-feeds/gdacs/rss.xml` with upstream `Accept: */*` and a server-side User-Agent. The app does not invent GDACS Incidents or substitute data if the proxy or upstream endpoint is unavailable; Source Status reports the limitation while reachable Public Feeds remain active.

## P8-T4 Public Feed coverage review

Current Public Feeds before P8-T4:

- `USGS Earthquakes` covers recent global earthquakes through no-secret GeoJSON.
- `NASA EONET` covers broad open environmental Incidents such as wildfires, volcanoes, floods, drought, dust/haze, sea/lake ice, and severe storms, but it is a broad Earth-observation feed rather than a local warning feed.
- `GDACS` covers global multi-hazard alerts via RSS through the local proxy, including tropical cyclones, floods, volcanoes, and earthquakes.

Evaluated no-secret additions:

- NOAA/NWS Active Alerts (`https://api.weather.gov/alerts/active?status=actual&message_type=alert`) — added. It returned `200 application/geo+json` in the local demo probe and materially improves US severe weather, flood, wildfire/fire-weather, winter weather, dust/smoke, and local hazard coverage without a paid API dependency. The Vite proxy supplies the required User-Agent and keeps the browser demo on a stable local URL.
- Additional GDACS endpoints — not added as a new source because GDACS RSS was already restored and additional endpoints would duplicate the existing GDACS Public Feed coverage.
- NASA disaster/EONET category-specific requests — not added as a separate source because they duplicate the existing NASA EONET Feed Adapter and would fragment attribution without improving coverage.

Chosen behavior: NOAA/NWS Active Alerts are normalized into Incidents with `NOAA/NWS Active Alerts` source attribution, Source Status, source filtering, Incident Detail/Saved Event compatibility, and AI Briefing compatibility through the shared Incident model. If the NOAA/NWS proxy or upstream endpoint is unavailable, the app reports Source Status without inventing replacement Incidents.
