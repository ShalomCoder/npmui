export type ProjectKind = "node" | "directory";

export interface ProjectScript {
  name: string;
  command: string;
}

export interface ProjectDependencySummary {
  production: number;
  development: number;
  peer: number;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  kind: ProjectKind;
  framework: string | null;
  packageManager: "npm" | "pnpm" | "yarn" | null;
  scripts: ProjectScript[];
  dependencies: ProjectDependencySummary;
  git: boolean;
  packageVersion: string | null;
  description: string | null;
  error: string | null;
}

export type ProcessStatus = "running" | "completed" | "failed" | "terminated";

export interface ManagedProcess {
  id: string;
  projectId: string;
  label: string;
  command: string;
  status: ProcessStatus;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  output: string;
  url: string | null;
}

export interface ToolInfo {
  name: string;
  executable: string;
  available: boolean;
  version: string | null;
  error: string | null;
}

export interface PackageResult {
  name: string;
  version: string;
  description: string;
  weeklyDownloads: number | null;
  homepage: string | null;
  repository: string | null;
  keywords: string[];
}

export interface DependencyInfo {
  name: string;
  range: string;
  type: "production" | "development" | "peer";
}

export interface CreateProjectRequest {
  name: string;
  destination: string;
  template: "node" | "typescript" | "vite" | "next";
  packageManager: "npm" | "pnpm" | "yarn";
}

export interface AppSettings {
  projectsDirectory: string;
  preferredShell: "cmd" | "powershell";
  customToolPaths: Record<string, string>;
}

export interface NpmuiApi {
  projects: {
    list(): Promise<Project[]>;
    selectDirectory(): Promise<string | null>;
    refresh(): Promise<Project[]>;
    openInExplorer(projectId: string): Promise<void>;
    openInVscode(projectId: string): Promise<void>;
    runScript(projectId: string, scriptName: string): Promise<ManagedProcess>;
    stopProcess(processId: string): Promise<void>;
    processes(): Promise<ManagedProcess[]>;
    onProcessOutput(listener: (process: ManagedProcess) => void): () => void;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(settings: AppSettings): Promise<AppSettings>;
    detectTools(): Promise<ToolInfo[]>;
  };
  packages: {
    search(query: string): Promise<PackageResult[]>;
    dependencies(projectId: string): Promise<DependencyInfo[]>;
    install(projectId: string, packageName: string, development: boolean): Promise<ManagedProcess>;
    remove(projectId: string, packageName: string): Promise<ManagedProcess>;
  };
  creation: {
    selectDestination(): Promise<string | null>;
    create(request: CreateProjectRequest): Promise<ManagedProcess>;
  };
}

declare global {
  interface Window {
    npmui: NpmuiApi;
  }
}
