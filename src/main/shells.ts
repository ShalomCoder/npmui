import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ShellProfile } from "../shared/contracts";

function stripJsonComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
}

function splitCommandLine(commandLine: string): { command: string; args: string[] } {
  const matches = commandLine.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const parts = matches.map((part) => part.replace(/^["']|["']$/g, ""));
  return { command: parts[0] ?? "", args: parts.slice(1) };
}

function configCandidates(): string[] {
  if (process.platform !== "win32") return [];
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return [];
  return [
    path.join(localAppData, "Packages", "Microsoft.WindowsTerminal_8wekyb3d8bbwe", "LocalState", "settings.json"),
    path.join(localAppData, "Packages", "Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe", "LocalState", "settings.json")
  ];
}

export async function readShellProfiles(): Promise<ShellProfile[]> {
  for (const filename of configCandidates()) {
    try {
      const parsed = JSON.parse(stripJsonComments(await readFile(filename, "utf8"))) as {
        profiles?: { defaults?: { startingDirectory?: string }; list?: Array<Record<string, unknown>> };
      };
      const profiles = parsed.profiles?.list ?? [];
      const result = profiles.flatMap((profile): ShellProfile[] => {
        const commandLine = typeof profile.commandline === "string" ? profile.commandline : typeof profile.executable === "string" ? profile.executable : "";
        const split = splitCommandLine(commandLine);
        const name = typeof profile.name === "string" ? profile.name : "Windows Terminal profile";
        if (!split.command) return [];
        return [{
          id: typeof profile.guid === "string" ? profile.guid : name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          name,
          command: split.command,
          args: split.args,
          source: filename
        }];
      });
      if (result.length) return result;
    } catch {
      // Try the next Windows Terminal installation/configuration.
    }
  }
  return [];
}

export function defaultTerminalDirectory(): string {
  return os.homedir();
}
