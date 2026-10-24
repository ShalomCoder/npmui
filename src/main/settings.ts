import { app } from "electron";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppSettings } from "../shared/contracts";

const defaultSettings = (): AppSettings => ({
  projectsDirectory: app.getPath("documents"),
  preferredShell: "",
  customToolPaths: {},
  themeColor: "#69518f"
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
        themeColor: typeof data.themeColor === "string" && /^#[0-9a-f]{6}$/i.test(data.themeColor) ? data.themeColor : "#69518f"
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
    themeColor: /^#[0-9a-f]{6}$/i.test(settings.themeColor) ? settings.themeColor : "#69518f"
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
