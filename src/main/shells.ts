import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

function inferCommand(name: string): { command: string; args: string[] } {
  const normalized = name.toLowerCase();
  if (normalized.includes("command prompt") || normalized === "cmd") return { command: process.env.ComSpec ?? "cmd.exe", args: [] };
  if (normalized.includes("powershell")) return { command: normalized.includes("core") ? "pwsh.exe" : "powershell.exe", args: [] };
  if (normalized.includes("ubuntu") || normalized.includes("debian") || normalized.includes("kali") || normalized.includes("linux")) {
    return { command: "wsl.exe", args: ["-d", name] };
  }
  return { command: "", args: [] };
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

function expandWindowsVariables(value: string): string {
  return value.replace(/%([^%]+)%/g, (_match, variable: string) => process.env[variable] ?? `%${variable}%`);
}

function normalizeIcon(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const icon = expandWindowsVariables(value.trim());
  if (icon.startsWith("file://") || icon.startsWith("ms-appx://") || icon.startsWith("data:")) return icon;
  if (path.isAbsolute(icon)) return pathToFileURL(icon).toString();
  return undefined;
}

async function installedGitBash(): Promise<ShellProfile[]> {
  if (process.platform !== "win32") return [];
  const candidates = [
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe"),
    path.join(process.env["ProgramW6432"] ?? "C:\\Program Files", "Git", "bin", "bash.exe"),
    path.join(process.env.ProgramFiles86 ?? "C:\\Program Files (x86)", "Git", "bin", "bash.exe"),
    path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Git", "bin", "bash.exe"),
    path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Git", "usr", "bin", "bash.exe")
  ];
  for (const command of candidates) {
    try {
      await access(command);
      return [{ id: "git-bash", name: "Git Bash", command, args: ["--login", "-i"], source: "Git for Windows", icon: command }];
    } catch {
      // Continue looking through common Git for Windows locations.
    }
  }
  return [];
}

export async function readShellProfiles(): Promise<ShellProfile[]> {
  const discovered: ShellProfile[] = [];
  for (const filename of configCandidates()) {
    try {
      const parsed = JSON.parse(stripJsonComments(await readFile(filename, "utf8"))) as {
        profiles?: { defaults?: { startingDirectory?: string }; list?: Array<Record<string, unknown>> };
      };
      const profiles = parsed.profiles?.list ?? [];
      const result = profiles.flatMap((profile): ShellProfile[] => {
        const commandLine = typeof profile.commandline === "string" ? profile.commandline : typeof profile.executable === "string" ? profile.executable : "";
        const name = typeof profile.name === "string" ? profile.name : "Windows Terminal profile";
        const explicit = splitCommandLine(commandLine);
        const split = explicit.command ? explicit : inferCommand(name);
        if (!split.command.trim()) return [];
        return [{
          id: typeof profile.guid === "string" ? profile.guid : name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          name,
          command: split.command,
          args: split.args,
          source: filename,
          icon: normalizeIcon(profile.icon)
        }];
      });
      discovered.push(...result);
    } catch {
      // Try the next Windows Terminal installation/configuration.
    }
  }
  const gitBash = await installedGitBash();
  const profiles = [...discovered, ...gitBash];
  return profiles.filter((profile, index) => profiles.findIndex((candidate) => (
    candidate.id === profile.id
    || (candidate.command.toLowerCase() === profile.command.toLowerCase() && candidate.args.join("\0") === profile.args.join("\0"))
  )) === index);
}

export function defaultTerminalDirectory(): string {
  return os.homedir();
}
