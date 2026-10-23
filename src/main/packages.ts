import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DependencyInfo, PackageResult } from "../shared/contracts";

export async function searchPackages(query: string): Promise<PackageResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const response = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(trimmed)}&size=20`);
  if (!response.ok) throw new Error(`npm Registry request failed (${response.status}).`);
  const data = await response.json() as { objects?: Array<{ package: { name: string; version?: string; description?: string; links?: { npm?: string; homepage?: string; repository?: string }; keywords?: string[] }; downloads?: { weekly?: number } }> };
  return (data.objects ?? []).map(({ package: pkg, downloads }) => ({
    name: pkg.name,
    version: pkg.version ?? "unknown",
    description: pkg.description ?? "",
    weeklyDownloads: downloads?.weekly ?? null,
    homepage: pkg.links?.homepage ?? pkg.links?.npm ?? null,
    repository: pkg.links?.repository ?? null,
    keywords: pkg.keywords ?? []
  }));
}

export async function readDependencies(projectPath: string): Promise<DependencyInfo[]> {
  const packageJson = JSON.parse(await readFile(path.join(projectPath, "package.json"), "utf8")) as Record<string, unknown>;
  const result: DependencyInfo[] = [];
  for (const type of ["dependencies", "devDependencies", "peerDependencies"] as const) {
    const value = packageJson[type];
    if (!value || typeof value !== "object") continue;
    for (const [name, range] of Object.entries(value)) {
      if (typeof range === "string") result.push({ name, range, type: type === "dependencies" ? "production" : type === "devDependencies" ? "development" : "peer" });
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}
