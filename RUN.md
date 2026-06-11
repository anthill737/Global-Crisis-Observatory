# Run the Global Crisis Dashboard on Windows

This guide is for Windows PowerShell and Windows File Explorer. Run commands from the project root unless a step says otherwise.

## 1. Prerequisites

Install these once on the Windows machine:

- Node.js 20 LTS or newer, including npm: <https://nodejs.org/>
- Git for Windows if you need to clone or update the project: <https://git-scm.com/download/win>

Confirm PowerShell can see Node.js and npm:

```powershell
node --version
npm --version
```

## 2. Open the project folder in PowerShell

Replace the path with the folder where this project is located:

```powershell
cd "C:\Users\AnthonyHill\OneDrive - Visionary Wealth Advisors, LLC\Documents\Personal\SCRIPTS\DEV-TEAM-TESTS\DEMO PROJECT"
```

## 3. First run: install dependencies once

Before using the double-click launcher for the first time, run this Windows PowerShell install command from the project root:

```powershell
npm install
```

You only need to repeat `npm install` after downloading a fresh copy of the project or after `package.json` / `package-lock.json` changes.

If the launcher reports that dependencies are missing or incomplete, leave the launcher window open long enough to read the message, then return to PowerShell in the project root and run the same install step:

```powershell
npm install
```

After install completes, double-click `Start Global Crisis Dashboard.bat` again.

## 4. Configuration

The core Global Crisis Dashboard uses no-secret Public Feeds and runs without configuration:

- USGS Earthquakes needs no key.
- NASA EONET needs no key.
- GDACS is shown as unavailable in Source Status in the browser runtime because its public RSS endpoint does not provide CORS access to this Vite app.

AI Briefing generation is optional. To enable AI Briefing, create `.env.local` with a server-side OpenAI API key before launching the app:

```powershell
@'
OPENAI_API_KEY=sk-your_key_here
'@ | Set-Content -Path .\.env.local -Encoding utf8
```

Do not put OpenAI keys in `VITE_` variables or in client code. If `.env.local` is missing or `OPENAI_API_KEY` is not set, the Global Crisis Dashboard still runs; only AI Briefing requests show a configuration message.

## 5. Repeat launch: double-click the launcher

After the first install, open the project folder in Windows File Explorer and double-click this exact root-level file:

```text
Start Global Crisis Dashboard.bat
```

The launcher changes into the project root automatically, so it works even if Windows starts the window from another folder. It then runs the established local launch command for this project:

```powershell
npm run dev
```

Keep the launcher window open while using the app. When startup finishes, open this local URL in your browser:

```text
http://127.0.0.1:5173/
```

If Vite prints a different local URL because port `5173` is busy, open the exact URL shown in the launcher window. Stop the local server with `Ctrl+C` in the launcher window, then press any key when prompted.

## 6. Manual launch option

If you prefer to launch from PowerShell instead of double-clicking, run this from the project root:

```powershell
npm run dev
```

Then open the local URL:

```powershell
Start-Process "http://127.0.0.1:5173/"
```

## 7. Verify it is running correctly

After opening the URL, confirm these visible checks:

1. The Global Crisis Dashboard loads and shows the summary metrics, filters, Source Status, Globe Map, Incident feed, Incident Detail, Saved Events View, and AI Briefing areas.
2. The Globe Map is visible with Incident Markers when reachable Public Feeds publish Incidents.
3. The Incident feed shows source-attributed Incidents from reachable Public Feeds.
4. Source Status lists USGS Earthquakes, NASA EONET, and GDACS; GDACS can be unavailable because of the documented browser CORS limitation while reachable Incidents remain visible.
5. Selecting an Incident from the feed or an Incident Marker opens Incident Detail with source attribution.
6. The Settings Control changes Visibility Mode between light, dark, and high contrast while text and Incident Markers remain readable.
7. Saved Events stay local to the browser, and no account or PII is required.
8. AI Briefing is optional and uses only public Incident or Filtered Incident Set data when `OPENAI_API_KEY` is configured.

## 8. Project checks

Run the full local check before handoff or after editing files:

```powershell
npm run check
```

For this project, `npm run check` runs TypeScript type checking first, then the Vitest suite, then the production build through npm lifecycle scripts.

To run only the Vitest suite:

```powershell
npm test
```

## Scope reminder

This app remains a local Global Crisis Dashboard for public natural-disaster and environmental Incidents. The launcher and this guide do not add accounts, collect PII, embed secrets, or change Public Feed, Saved Event, Visibility Mode, Source Status, Incident Detail, Globe Map, or AI Briefing behavior.
