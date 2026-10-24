import { app } from "electron";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppSettings } from "../shared/contracts";

const defaultSettings = (): AppSettings => ({
  projectsDirectory: app.getPath("documents"),
  preferredShell: "",
  customToolPaths: {},
  themeColor: "#69518f",
  terminalFontSize: 13,
  terminalFontFamily: "Cascadia Code, Consolas, monospace",
  terminalBackground: "#17151f",
  terminalForeground: "#e8e1f4"
});

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const data = JSON.parse(await readFile(settingsPath(), "utf8")) as Partial<AppSettings>;
    if (typeof data.projectsDirectory === "string" && data.projectsDirectory.trim()) {
      return {
        projectsDirectory: path.resolve(data.projectsDirectory),
        preferredShell: typeof data.preferredShell === "string" ? data.preferredShell : "",
        customToolPaths: data.customToolPaths && typeof data.customToolPaths === "object" ? data.customToolPaths as Record<string, string> : {},
        themeColor: typeof data.themeColor === "string" && /^#[0-9a-f]{6}$/i.test(data.themeColor) ? data.themeColor : "#69518f",
        terminalFontSize: typeof data.terminalFontSize === "number" && data.terminalFontSize >= 10 && data.terminalFontSize <= 24 ? data.terminalFontSize : 13,
        terminalFontFamily: typeof data.terminalFontFamily === "string" && data.terminalFontFamily.trim() ? data.terminalFontFamily.trim() : "Cascadia Code, Consolas, monospace",
        terminalBackground: typeof data.terminalBackground === "string" && /^#[0-9a-f]{6}$/i.test(data.terminalBackground) ? data.terminalBackground : "#17151f",
        terminalForeground: typeof data.terminalForeground === "string" && /^#[0-9a-f]{6}$/i.test(data.terminalForeground) ? data.terminalForeground : "#e8e1f4"
      };
    }
  } catch {
    // A missing or malformed settings file is replaced with safe defaults.
  }
  return defaultSettings();
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const normalized: AppSettings = {
    projectsDirectory: path.resolve(settings.projectsDirectory),
    preferredShell: typeof settings.preferredShell === "string" ? settings.preferredShell : "",
    customToolPaths: settings.customToolPaths ?? {},
    themeColor: /^#[0-9a-f]{6}$/i.test(settings.themeColor) ? settings.themeColor : "#69518f",
    terminalFontSize: Number.isFinite(settings.terminalFontSize) ? Math.min(24, Math.max(10, settings.terminalFontSize)) : 13,
    terminalFontFamily: typeof settings.terminalFontFamily === "string" && settings.terminalFontFamily.trim() ? settings.terminalFontFamily.trim() : "Cascadia Code, Consolas, monospace",
    terminalBackground: /^#[0-9a-f]{6}$/i.test(settings.terminalBackground) ? settings.terminalBackground : "#17151f",
    terminalForeground: /^#[0-9a-f]{6}$/i.test(settings.terminalForeground) ? settings.terminalForeground : "#e8e1f4"
  };
  try {
    await access(normalized.projectsDirectory);
    if (!(await stat(normalized.projectsDirectory)).isDirectory()) {
      throw new Error("The projects path is not a directory.");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "The projects path is not a directory.") throw error;
    throw new Error("The projects directory does not exist or cannot be accessed.");
  }
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}
