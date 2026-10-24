import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { ManagedProcess } from "../shared/contracts";

type OutputListener = (process: ManagedProcess) => void;

interface RuntimeProcess {
  record: ManagedProcess;
  child: ChildProcess;
}

const runtimes = new Map<string, RuntimeProcess>();
const history = new Map<string, ManagedProcess>();
let listener: OutputListener | null = null;
let hydrated = false;

function historyPath(): string {
  return path.join(app.getPath("userData"), "processes.json");
}

function persist(): void {
  try {
    const records = [...history.values()].slice(-200);
    writeFileSync(historyPath(), JSON.stringify(records, null, 2), "utf8");
  } catch {
    // Process execution remains functional if history persistence is unavailable.
  }
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    if (!existsSync(historyPath())) return;
    const records = JSON.parse(readFileSync(historyPath(), "utf8")) as ManagedProcess[];
    for (const record of records) {
      if (!record || typeof record.id !== "string") continue;
      if (record.status === "running") {
        record.status = "terminated";
        record.endedAt = record.endedAt ?? new Date().toISOString();
        record.output += "\n[npmUI closed while this process was running]\n";
      }
      history.set(record.id, record);
    }
    persist();
  } catch {
    // Ignore malformed historical records and continue with an empty process history.
  }
}

export function setProcessListener(next: OutputListener): void {
  listener = next;
}

export function listProcesses(): ManagedProcess[] {
  hydrate();
  return [...history.values()];
}

function emit(runtime: RuntimeProcess): void {
  listener?.({ ...runtime.record });
}

export function startProcess(options: {
  projectId: string;
  cwd: string;
  label: string;
  executable: string;
  args: string[];
}): ManagedProcess {
  hydrate();
  const id = crypto.randomUUID();
  const command = [options.executable, ...options.args].join(" ");
  const record: ManagedProcess = {
    id,
    projectId: options.projectId,
    label: options.label,
    command,
    status: "running",
    startedAt: new Date().toISOString(),
    endedAt: null,
    exitCode: null,
    output: "",
    url: null
  };
  const child = spawn(options.executable, options.args, {
    cwd: options.cwd,
    windowsHide: true,
    shell: process.platform === "win32" && options.executable.toLowerCase().endsWith(".cmd"),
    env: { ...process.env, FORCE_COLOR: "0" }
  });
  const runtime = { record, child };
  runtimes.set(id, runtime);
  history.set(id, record);
  persist();
  const append = (chunk: Buffer): void => {
    const text = chunk.toString();
    record.output += text;
    const detectedUrl = record.output.match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#][^\s"'<>]*)?/i)?.[0]
      ?? record.output.match(/(?:localhost|127\.0\.0\.1):\d+(?:[/?#][^\s"'<>]*)?/i)?.[0];
    const normalizedUrl = detectedUrl?.startsWith("http") ? detectedUrl : detectedUrl ? `http://${detectedUrl}` : null;
    if (normalizedUrl) record.url = normalizedUrl.replace(/[),.;]+$/, "");
    if (record.output.length > 200_000) record.output = record.output.slice(-200_000);
    persist();
    emit(runtime);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  child.on("error", (error) => {
    record.output += `${error.message}\n`;
    record.status = "failed";
    record.endedAt = new Date().toISOString();
    persist();
    emit(runtime);
  });
  child.on("close", (code) => {
    if (record.status === "running") record.status = code === 0 ? "completed" : "failed";
    record.exitCode = code;
    record.endedAt = new Date().toISOString();
    persist();
    emit(runtime);
  });
  emit(runtime);
  return { ...record };
}

export async function stopProcess(id: string): Promise<void> {
  const runtime = runtimes.get(id);
  if (!runtime || runtime.record.status !== "running") return;
  if (process.platform === "win32" && runtime.child.pid) {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(runtime.child.pid), "/t", "/f"], { windowsHide: true });
      killer.on("close", () => resolve());
      killer.on("error", () => resolve());
    });
  } else {
    runtime.child.kill("SIGTERM");
  }
  runtime.record.status = "terminated";
  runtime.  record.endedAt = new Date().toISOString();
  persist();
  emit(runtime);
}
