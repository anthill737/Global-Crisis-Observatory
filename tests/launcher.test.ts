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
    expect(launcher).toContain("The dashboard will open automatically in your default browser when the local server is ready.");
  });

  it("prints the fallback local URL before launch and after startup failure", () => {
    const launcher = readLauncher();

    expect(launcher).toContain("If the browser does not open, manually open this exact local URL:");
    expect(launcher).toContain("Review the startup messages above, then manually open this exact local URL if the server is running:");
    expect(launcher.match(/echo   %LOCAL_APP_URL%/g)).toHaveLength(2);
    expect(launcher).toContain('if not "%LAUNCH_EXIT%"=="0" (');
  });
});

describe("Windows run guide launcher documentation", () => {
  it("documents the double-click launcher and fallback local URL", () => {
    const runGuide = readRunGuide();

    expect(runGuide).toContain("Start Global Crisis Dashboard.bat");
    expect(runGuide).toContain("npm run dev -- --open");
    expect(runGuide).toContain("The `--open` flag makes Vite open the Global Crisis Dashboard in your default browser when the local server is ready.");
    expect(runGuide).toContain("If the browser does not open automatically, manually open this URL:");
    expect(runGuide).toContain("http://127.0.0.1:5173/");
  });

  it("keeps current setup and optional AI Briefing Provider guidance in RUN.md", () => {
    const runGuide = readRunGuide();

    expect(runGuide).toContain("The Settings Control lets you choose one AI Briefing Choice: OpenAI, Anthropic, Gemini, or Disabled.");
    expect(runGuide).toContain("AI Briefing Provider keys are read only by the local Vite middleware; they are not exposed through `VITE_` variables or client code.");
    expect(runGuide).toContain("Do not open `index.html` directly; the Vite local server is required for the GDACS Public Feed proxy and AI Briefing request middleware.");
    expect(runGuide).toContain("npm run check");
  });
});
