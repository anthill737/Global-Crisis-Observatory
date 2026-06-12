# Run the Global Crisis Dashboard on Windows

This guide is for Windows PowerShell and Windows File Explorer. Run every PowerShell command from the project root unless a step says otherwise.

## 1. Prerequisites

Install these once on the Windows machine:

- Node.js 20 LTS or newer, including npm: <https://nodejs.org/>
- Git for Windows if you need to clone or update the project: <https://git-scm.com/download/win>
- A current desktop browser for the local Vite app.

Confirm PowerShell can see Node.js and npm:

```powershell
node --version
npm --version
```

## 2. Open the project folder

In PowerShell, replace the path with the folder where this project is located:

```powershell
cd "C:\Users\AnthonyHill\OneDrive - Visionary Wealth Advisors, LLC\Documents\Personal\SCRIPTS\DEV-TEAM-TESTS\DEMO PROJECT"
```

You can also open the same folder in Windows File Explorer for the double-click launcher step below.

## 3. Install dependencies

Run this once before the first launch:

```powershell
npm install
```

Repeat `npm install` only after downloading a fresh copy of the project or after `package.json` / `package-lock.json` changes.

If the launcher says dependencies are missing or incomplete, leave its window open long enough to read the message, then return to PowerShell in the project root and run:

```powershell
npm install
```

## 4. Optional AI Briefing configuration

The core Global Crisis Dashboard uses no-secret Public Feeds and runs without AI keys. AI Briefings are optional.

The Settings Control lets you choose one AI Briefing Choice: OpenAI, Anthropic, Gemini, or Disabled. Only the selected AI Briefing Provider is used for a request. You may save keys for more than one provider in `.env.local`, but the app still sends an AI Briefing request only to the provider selected in the Settings Control.

AI Briefing Provider keys are read only by the local Vite middleware; they are not exposed through `VITE_` variables or client code.

Create `.env.local` only if you want AI Briefings from one or more providers:

```powershell
@'
OPENAI_API_KEY=sk-your_openai_key_here
ANTHROPIC_API_KEY=sk-ant-your_anthropic_key_here
GEMINI_API_KEY=your_gemini_key_here
'@ | Set-Content -Path .\.env.local -Encoding utf8
```

Use only the keys you need:

- `OPENAI_API_KEY` enables AI Briefings when AI Briefing Choice is OpenAI.
- `ANTHROPIC_API_KEY` enables AI Briefings when AI Briefing Choice is Anthropic.
- `GEMINI_API_KEY` enables AI Briefings when AI Briefing Choice is Gemini.

If `.env.local` is missing, or if the selected AI Briefing Provider key is not set, the Global Crisis Dashboard still runs; AI Briefing requests show a provider-specific configuration message.

## 5. Launch with the Windows launcher

After dependencies are installed, open the project root in Windows File Explorer and double-click this file:

```text
Start Global Crisis Dashboard.bat
```

The root-level launcher changes into the project root automatically, checks for Node.js, npm, installed dependencies, and Vite, then starts the local app with:

```powershell
npm run dev -- --open
```

The `--open` flag makes Vite open the Global Crisis Dashboard in your default browser when the local server is ready. Keep the launcher window open while using the app.

Do not open `index.html` directly; the Vite local server is required for the GDACS Public Feed proxy and AI Briefing request middleware.

If the browser does not open automatically, manually open this URL:

```text
http://127.0.0.1:5173/
```

If the launcher window shows a different local URL because port `5173` is busy, open the exact URL shown there instead.

To stop the local server, click the launcher window, press `Ctrl+C`, then press any key if the launcher asks.

## 6. Manual launch option

If you prefer PowerShell instead of double-clicking the launcher, run this from the project root:

```powershell
npm run dev
```

Then open the local URL in your default browser:

```powershell
Start-Process "http://127.0.0.1:5173/"
```

To match the launcher behavior from PowerShell, you can also run:

```powershell
npm run dev -- --open
```

## 7. Verification checklist

After the browser opens, confirm these visible checks:

1. The Global Crisis Dashboard loads without asking for an account or PII.
2. The page shows summary metrics, filters, Source Status, the Globe Map, the Incident feed, Incident Detail, Saved Events View, Settings Control, and AI Briefing areas.
3. Source Status lists USGS Earthquakes, NASA EONET, and GDACS with clear reachable, degraded, or unavailable messaging.
4. Reachable Public Feeds provide source-attributed Incidents; GDACS refreshes through the local Public Feed proxy when the Vite server is running, and Source Status explains any GDACS upstream or proxy limitation without blocking the rest of the Global Crisis Dashboard.
5. The Globe Map shows Incident Markers for Incidents with coordinates; selecting an Incident Marker or Incident keeps Incident Detail synchronized.
6. Incident filters update the Filtered Incident Set without breaking Source Status, Incident Detail, or Saved Events View.
7. The Settings Control changes Visibility Mode and persists the selected mode across refreshes.
8. The Settings Control lets you change AI Briefing Choice between OpenAI, Anthropic, Gemini, and Disabled.
9. AI Briefings stay disabled when AI Briefing Choice is Disabled, and use only the selected AI Briefing Provider when a matching key is configured.
10. Saved Events remain local to the browser and can be revisited from the Saved Events View.

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

To run only the production build:

```powershell
npm run build
```

## Scope reminder

This app remains a local Global Crisis Dashboard for public natural-disaster and environmental Incidents. The launcher and this guide do not add accounts, collect PII, embed secrets, or change Public Feed, Saved Event, Visibility Mode, Source Status, Incident Detail, Globe Map, or AI Briefing behavior.
