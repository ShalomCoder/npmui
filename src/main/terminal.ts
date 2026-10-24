import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as pty from "node-pty";
import type { ShellProfile, TerminalSession } from "../shared/contracts";

interface RuntimeTerminal {
  session: TerminalSession;
  process: pty.IPty;
}

const sessions = new Map<string, RuntimeTerminal>();
let dataListener: ((event: { id: string; data: string }) => void) | null = null;
let exitListener: ((event: { id: string; exitCode: number }) => void) | null = null;

export function setTerminalListeners(
  onData: (event: { id: string; data: string }) => void,
  onExit: (event: { id: string; exitCode: number }) => void
): void {
  dataListener = onData;
  exitListener = onExit;
}

function fallbackShell(): ShellProfile {
  const command = process.platform === "win32" ? process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe" : process.env.SHELL ?? "/bin/sh";
  return { id: "system-default", name: "System default", command, args: [], source: "system" };
}

function expandWindowsVariables(value: string): string {
  return value.replace(/%([^%]+)%/g, (_match, variable: string) => process.env[variable] ?? `%${variable}%`);
}

function resolveCommand(command: string): string | null {
  const expanded = process.platform === "win32" ? expandWindowsVariables(command.trim()) : command.trim();
  if (!expanded) return null;
  if (process.platform !== "win32") return expanded;
  const normalized = expanded.toLowerCase();
  if (normalized === "cmd" || normalized === "cmd.exe") return process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe";
  if (path.isAbsolute(expanded)) return existsSync(expanded) ? expanded : null;
  try {
    const resolved = execFileSync("where.exe", [expanded], { encoding: "utf8", windowsHide: true }).split(/\r?\n/).find(Boolean);
    return resolved?.trim() || null;
  } catch {
    return null;
  }
}

export function createTerminal(cwd?: string, profile?: ShellProfile): TerminalSession {
  const requested = profile && profile.command.trim() ? profile : fallbackShell();
  const command = resolveCommand(requested.command);
  const selected = command ? { ...requested, command } : fallbackShell();
  const workingDirectory = cwd && path.isAbsolute(cwd) ? cwd : os.homedir();
  const id = crypto.randomUUID();
  let terminalProcess: pty.IPty;
  try {
    terminalProcess = pty.spawn(selected.command, selected.args, {
      name: "xterm-256color",
      cols: 100,
      rows: 30,
      cwd: workingDirectory,
      env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to start ${selected.name} (${selected.command}): ${detail}`);
  }
  const session = { id, cwd: workingDirectory, shell: selected.name, shellId: selected.id };
  const runtime = { session, process: terminalProcess };
  sessions.set(id, runtime);
  terminalProcess.onData((data) => dataListener?.({ id, data }));
  terminalProcess.onExit(({ exitCode }) => {
    sessions.delete(id);
    exitListener?.({ id, exitCode });
  });
  return session;
}

export function writeTerminal(id: string, data: string): void {
  const runtime = sessions.get(id);
  if (!runtime) throw new Error("Terminal session is no longer available.");
  runtime.process.write(data);
}

export function resizeTerminal(id: string, columns: number, rows: number): void {
  const runtime = sessions.get(id);
  if (!runtime) throw new Error("Terminal session is no longer available.");
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 20 || rows < 5) throw new Error("Invalid terminal size.");
  runtime.process.resize(columns, rows);
}

export function closeTerminal(id: string): void {
  const runtime = sessions.get(id);
  if (runtime) runtime.process.kill();
}
