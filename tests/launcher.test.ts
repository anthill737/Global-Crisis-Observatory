import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const launcherPath = "Start Global Crisis Dashboard.bat";
const runGuidePath = "RUN.md";

function readLauncher(): string {
  return readFileSync(launcherPath, "utf8").replace(/\r\n/g, "\n");
}

function readRunGuide(): string {
  return readFileSync(runGuidePath, "utf8").replace(/\r\n/g, "\n");
}

describe("Windows launcher auto-open behavior", () => {
  it("starts Vite with browser auto-open enabled from the project root", () => {
    const launcher = readLauncher();

    expect(launcher).toContain('set "LOCAL_APP_URL=http://127.0.0.1:5173/"');
    expect(launcher).toContain('set "LAUNCH_COMMAND=npm run dev -- --open"');
    expect(launcher).toContain("pushd \"%~dp0\" >nul 2>nul");
    expect(launcher).toContain("call %LAUNCH_COMMAND%");
    expect(launcher).toContain("Browser auto-open:");
    expect(launcher).toContain("Vite receives --open and asks Windows to open your default browser when the local server is ready.");
  });

  it("prints a clear fallback local URL before launch and after startup failure", () => {
    const launcher = readLauncher();

    expect(launcher).toContain("Browser fallback:");
    expect(launcher).toContain("If no browser window opens, Windows asks which app to use, or Vite reports that browser opening failed,");
    expect(launcher).toContain("copy and paste this fallback URL into your browser:");
    expect(launcher).toContain("If browser auto-open failed but the server reached a ready state, copy and paste this fallback URL into your browser:");
    expect(launcher).toContain("The Global Crisis Dashboard only works through the Vite local server; do not open index.html directly.");
    expect(launcher.match(/echo   %LOCAL_APP_URL%/g)).toHaveLength(2);
    expect(launcher).toContain('if not "%LAUNCH_EXIT%"=="0" (');
  });
});

describe("Windows run guide launcher documentation", () => {
  it("documents prerequisites, installation, configuration, and project checks", () => {
    const runGuide = readRunGuide();

    expect(runGuide).toContain("## 1. Windows prerequisites");
    expect(runGuide).toContain("node --version");
    expect(runGuide).toContain("npm --version");
    expect(runGuide).toContain("## 3. Install dependencies");
    expect(runGuide).toContain("npm install");
    expect(runGuide).toContain("## 4. Configuration");
    expect(runGuide).toContain("No configuration is required for the core Global Crisis Dashboard.");
    expect(runGuide).toContain("npm run check");
  });

  it("documents the double-click launcher, exact launch command, and fallback local URL", () => {
    const runGuide = readRunGuide();

    expect(runGuide).toContain("## 5. Double-click launcher flow");
    expect(runGuide).toContain("Start Global Crisis Dashboard.bat");
    expect(runGuide).toContain("then starts the local app with the exact launch command:");
    expect(runGuide).toContain("npm run dev -- --open");
    expect(runGuide).toContain("The `--open` flag makes Vite ask Windows to open the Global Crisis Dashboard in your default browser when the local server is ready.");
    expect(runGuide).toContain("If no browser window opens, Windows asks which app to use, or Vite reports that browser opening failed, copy and paste this fallback URL into your browser:");
    expect(runGuide).toContain("http://127.0.0.1:5173/");
    expect(runGuide).toContain("The fallback URL is a Vite local-server URL, not a standalone file path.");
  });

  it("keeps the verification checklist aligned with current app startup behavior", () => {
    const runGuide = readRunGuide();

    expect(runGuide).toContain("## 7. Verification checklist");
    expect(runGuide).toContain("The launcher window shows `npm run dev -- --open`, the browser auto-open note, and the fallback URL `http://127.0.0.1:5173/`.");
    expect(runGuide).toContain("The Global Crisis Dashboard opens in the default browser, or the same fallback URL opens it manually.");
    expect(runGuide).toContain("Do not open `index.html` directly; the Vite local server is required for the GDACS Public Feed proxy, the NOAA/NWS Active Alerts Public Feed proxy, and AI Briefing request middleware.");
  });

  it("uses Windows PowerShell syntax for documented copy-paste commands", () => {
    const runGuide = readRunGuide();

    expect(runGuide).toContain('cd "C:\\Users\\AnthonyHill\\OneDrive - Visionary Wealth Advisors, LLC\\Documents\\Personal\\SCRIPTS\\DEV-TEAM-TESTS\\DEMO PROJECT"');
    expect(runGuide).toContain('Start-Process "http://127.0.0.1:5173/"');
    expect(runGuide).not.toContain(" && ");
    expect(runGuide).not.toContain("export ");
    expect(runGuide).not.toContain("source ");
  });

  it("keeps optional AI Briefing Provider guidance in RUN.md", () => {
    const runGuide = readRunGuide();

    expect(runGuide).toContain("The Settings Control lets you choose one AI Briefing Choice: OpenAI, Anthropic, Gemini, or Disabled.");
    expect(runGuide).toContain("AI Briefing Provider keys are read only by the local Vite middleware; they are not exposed through `VITE_` variables or client code.");
  });
});
