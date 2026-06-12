# Developer Notes

## GDACS Public Feed decision

Task P3-T4 probed the GDACS public RSS endpoint at `https://www.gdacs.org/xml/rss.xml` for the Global Crisis Dashboard.

Result: the endpoint returned RSS successfully from the server-side probe, but it did not advertise an `Access-Control-Allow-Origin` header. Because this Vite app fetches Public Feeds from the browser runtime, the dashboard cannot dependably consume GDACS live without adding a trusted server-side proxy.

Chosen behavior: GDACS is shown in Source Status as unavailable with an explicit limitation message. The app does not invent GDACS Incidents or substitute data. USGS Earthquakes and NASA EONET remain active and continue to populate Incidents normally.

If GDACS is needed later, add a server-side Feed Adapter or Vite middleware proxy that fetches the RSS feed outside the browser CORS boundary, then normalize those records into source-attributed Incidents.
