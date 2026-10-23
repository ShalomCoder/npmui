import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import type { ManagedProcess } from "../shared/contracts";

type OutputListener = (process: ManagedProcess) => void;

interface RuntimeProcess {
  record: ManagedProcess;
  child: ChildProcess;
}

const runtimes = new Map<string, RuntimeProcess>();
let listener: OutputListener | null = null;

export function setProcessListener(next: OutputListener): void {
  listener = next;
}

export function listProcesses(): ManagedProcess[] {
  return [...runtimes.values()].map(({ record }) => record);
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
    output: ""
  };
  const child = spawn(options.executable, options.args, {
    cwd: options.cwd,
    windowsHide: true,
    shell: false,
    env: { ...process.env, FORCE_COLOR: "0" }
  });
  const runtime = { record, child };
  runtimes.set(id, runtime);
  const append = (chunk: Buffer): void => {
    record.output += chunk.toString();
    if (record.output.length > 200_000) record.output = record.output.slice(-200_000);
    emit(runtime);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  child.on("error", (error) => {
    record.output += `${error.message}\n`;
    record.status = "failed";
    record.endedAt = new Date().toISOString();
    emit(runtime);
  });
  child.on("close", (code) => {
    if (record.status === "running") record.status = code === 0 ? "completed" : "failed";
    record.exitCode = code;
    record.endedAt = new Date().toISOString();
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
  runtime.record.endedAt = new Date().toISOString();
  emit(runtime);
}
