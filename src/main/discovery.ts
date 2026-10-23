import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Project, ProjectDependencySummary, ProjectScript } from "../shared/contracts";

function projectId(projectPath: string): string {
  return path.normalize(projectPath).toLowerCase();
}

function detectFramework(packageJson: Record<string, unknown>): string | null {
  const allDependencies = {
    ...(packageJson.dependencies as Record<string, unknown> | undefined),
    ...(packageJson.devDependencies as Record<string, unknown> | undefined)
  };
  const knownFrameworks: Array<[string, string]> = [
    ["next", "Next.js"],
    ["vite", "Vite"],
    ["@angular/core", "Angular"],
    ["react", "React"],
    ["vue", "Vue"],
    ["svelte", "Svelte"],
    ["electron", "Electron"]
  ];
  return knownFrameworks.find(([dependency]) => dependency in allDependencies)?.[1] ?? null;
}

function getDependencies(packageJson: Record<string, unknown>): ProjectDependencySummary {
  const count = (key: string): number => {
    const value = packageJson[key];
    return value && typeof value === "object" ? Object.keys(value).length : 0;
  };
  return { production: count("dependencies"), development: count("devDependencies"), peer: count("peerDependencies") };
}

function getScripts(packageJson: Record<string, unknown>): ProjectScript[] {
  const scripts = packageJson.scripts;
  if (!scripts || typeof scripts !== "object") return [];
  return Object.entries(scripts)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([name, command]) => ({ name, command }));
}

function detectPackageManager(_projectPath: string, packageJson: Record<string, unknown>): Project["packageManager"] {
  if (packageJson.packageManager && typeof packageJson.packageManager === "string") {
    const manager = packageJson.packageManager.split("@")[0];
    if (manager === "npm" || manager === "pnpm" || manager === "yarn") return manager;
  }
  return null;
}

async function discoverProject(projectPath: string): Promise<Project | null> {
  let entries: string[];
  try {
    entries = await readdir(projectPath);
  } catch {
    return null;
  }

  const hasPackageJson = entries.includes("package.json");
  const hasGit = entries.includes(".git");
  if (!hasPackageJson && !hasGit) return null;

  let packageJson: Record<string, unknown> = {};
  let error: string | null = null;
  if (hasPackageJson) {
    try {
      packageJson = JSON.parse(await readFile(path.join(projectPath, "package.json"), "utf8")) as Record<string, unknown>;
    } catch {
      error = "package.json could not be read or parsed";
    }
  }

  return {
    id: projectId(projectPath),
    name: typeof packageJson.name === "string" ? packageJson.name : path.basename(projectPath),
    path: projectPath,
    kind: hasPackageJson ? "node" : "directory",
    framework: error ? null : detectFramework(packageJson),
    packageManager: error ? null : detectPackageManager(projectPath, packageJson),
    scripts: error ? [] : getScripts(packageJson),
    dependencies: error ? { production: 0, development: 0, peer: 0 } : getDependencies(packageJson),
    git: hasGit,
    packageVersion: typeof packageJson.version === "string" ? packageJson.version : null,
    description: typeof packageJson.description === "string" ? packageJson.description : null,
    error
  };
}

export async function discoverProjects(rootDirectory: string): Promise<Project[]> {
  try {
    await access(rootDirectory);
    const children = await readdir(rootDirectory, { withFileTypes: true });
    const projects = await Promise.all(
      children
        .filter((entry) => entry.isDirectory())
        .map((entry) => discoverProject(path.join(rootDirectory, entry.name)))
    );
    return projects.filter((project): project is Project => project !== null).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export function isProjectIdInList(projects: Project[], id: string): Project | undefined {
  return projects.find((project) => project.id === id);
}
