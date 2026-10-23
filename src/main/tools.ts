import { spawn } from "node:child_process";
import type { ToolInfo } from "../shared/contracts";

const tools = ["node", "npm", "pnpm", "yarn", "git", "python", "php"];

async function detect(name: string, executable: string): Promise<ToolInfo> {
  return new Promise((resolve) => {
    const child = spawn(executable, ["--version"], { windowsHide: true, shell: false });
    let output = "";
    child.stdout?.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", (error) => resolve({ name, executable, available: false, version: null, error: error.message }));
    child.on("close", (code) => {
      const version = output.trim().split(/\r?\n/)[0] ?? "";
      resolve({ name, executable, available: code === 0, version: version || null, error: code === 0 ? null : "Executable returned an error." });
    });
  });
}

export function detectTools(custom: Record<string, string> = {}): Promise<ToolInfo[]> {
  return Promise.all(tools.map((name) => {
    const executable = custom[name] || (process.platform === "win32" && ["npm", "pnpm", "yarn"].includes(name) ? `${name}.cmd` : name);
    return detect(name, executable);
  }));
}
