import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import path from "node:path";
import { discoverProjects, isProjectIdInList } from "./discovery";
import { getSettings, saveSettings } from "./settings";
import { startProcess, listProcesses, setProcessListener, stopProcess } from "./processes";
import { detectTools } from "./tools";
import { readDependencies, searchPackages } from "./packages";
import { closeTerminal, createTerminal, resizeTerminal, setTerminalListeners, writeTerminal } from "./terminal";
import { readShellProfiles, defaultTerminalDirectory } from "./shells";
import type { AppSettings, CreateProjectRequest, InstallableTool, Project } from "../shared/contracts";
import { mkdir, writeFile, access } from "node:fs/promises";

let mainWindow: BrowserWindow | null = null;
let cachedProjects: Project[] = [];
let terminalWindow: BrowserWindow | null = null;

function createWindow(): void {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1050,
    minHeight: 680,
    autoHideMenuBar: true,
    backgroundColor: "#f7f7fb",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  if (!app.isPackaged) {
    void mainWindow.loadURL("http://localhost:5173");
  } else {
    void mainWindow.loadFile(path.join(app.getAppPath(), "dist/index.html"));
  }
}

function createTerminalWindow(cwd?: string, shellId?: string): void {
  terminalWindow = new BrowserWindow({
    width: 980,
    height: 620,
    minWidth: 620,
    minHeight: 360,
    title: "npmUI Terminal",
    backgroundColor: "#17151f",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  terminalWindow.on("closed", () => { terminalWindow = null; });
  const target = `#terminal?${new URLSearchParams({ ...(cwd ? { cwd } : {}), ...(shellId ? { shell: shellId } : {}) }).toString()}`;
  if (!app.isPackaged) void terminalWindow.loadURL(`http://localhost:5173/${target}`);
  else void terminalWindow.loadFile(path.join(app.getAppPath(), "dist/index.html"), { hash: target.slice(1) });
}

async function refreshProjects(): Promise<Project[]> {
  const settings = await getSettings();
  cachedProjects = await discoverProjects(settings.projectsDirectory);
  return cachedProjects;
}

function registerIpc(): void {
  const getProject = (projectId: unknown): Project => {
    if (typeof projectId !== "string") throw new Error("Invalid project id.");
    const project = isProjectIdInList(cachedProjects, projectId);
    if (!project) throw new Error("Project is no longer available.");
    return project;
  };
  ipcMain.handle("settings:get", async () => getSettings());
  ipcMain.handle("settings:update", async (_event, settings: AppSettings) => {
    if (!settings || typeof settings.projectsDirectory !== "string" || !settings.projectsDirectory.trim()) {
      throw new Error("A valid projects directory is required.");
    }
    const saved = await saveSettings(settings);
    cachedProjects = await discoverProjects(saved.projectsDirectory);
    return saved;
  });
  ipcMain.handle("settings:detect-tools", async () => detectTools((await getSettings()).customToolPaths));
  ipcMain.handle("settings:install-tool", async (_event, tool: unknown) => {
    if (!["node", "git", "pnpm", "yarn", "python", "php"].includes(tool as string)) throw new Error("Unsupported tool.");
    const commands: Record<InstallableTool, { executable: string; args: string[]; label: string }> = {
      node: { executable: "winget.exe", args: ["install", "--id", "OpenJS.NodeJS.LTS", "--exact", "--accept-source-agreements", "--accept-package-agreements"], label: "Install Node.js and npm" },
      git: { executable: "winget.exe", args: ["install", "--id", "Git.Git", "--exact", "--accept-source-agreements", "--accept-package-agreements"], label: "Install Git" },
      python: { executable: "winget.exe", args: ["install", "--id", "Python.Python.3.13", "--exact", "--accept-source-agreements", "--accept-package-agreements"], label: "Install Python" },
      php: { executable: "winget.exe", args: ["install", "--id", "PHP.PHP", "--exact", "--accept-source-agreements", "--accept-package-agreements"], label: "Install PHP" },
      pnpm: { executable: process.platform === "win32" ? "corepack.cmd" : "corepack", args: ["enable", "pnpm"], label: "Enable pnpm with Corepack" },
      yarn: { executable: process.platform === "win32" ? "corepack.cmd" : "corepack", args: ["enable", "yarn"], label: "Enable Yarn with Corepack" }
    };
    const command = commands[tool as InstallableTool];
    return startProcess({ projectId: "__toolchain__", cwd: app.getPath("home"), label: command.label, executable: command.executable, args: command.args });
  });
  ipcMain.handle("settings:shells", () => readShellProfiles());
  ipcMain.handle("projects:list", async () => {
    if (cachedProjects.length === 0) await refreshProjects();
    return cachedProjects;
  });
  ipcMain.handle("projects:refresh", () => refreshProjects());
  ipcMain.handle("projects:select-directory", async () => {
    const options: OpenDialogOptions = {
      properties: ["openDirectory", "createDirectory"],
      title: "Choose your projects directory"
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle("projects:open-explorer", async (_event, projectId: unknown) => {
    const project = getProject(projectId);
    await shell.openPath(project.path);
  });
  ipcMain.handle("projects:open-vscode", async (_event, projectId: unknown) => {
    const project = getProject(projectId);
    await shell.openExternal(`vscode://file/${encodeURIComponent(project.path)}`);
  });
  ipcMain.handle("projects:open-url", async (_event, value: unknown) => {
    if (typeof value !== "string") throw new Error("Invalid URL.");
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error("Invalid URL.");
    }
    if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      throw new Error("Only local development URLs can be opened.");
    }
    await shell.openExternal(url.toString());
  });
  ipcMain.handle("projects:run-script", async (_event, projectId: unknown, scriptName: unknown) => {
    const project = getProject(projectId);
    if (typeof scriptName !== "string" || !project.scripts.some((script) => script.name === scriptName)) throw new Error("Script is not available.");
    const manager = project.packageManager ?? "npm";
    const executable = process.platform === "win32" ? `${manager}.cmd` : manager;
    return startProcess({ projectId: project.id, cwd: project.path, label: `npm run ${scriptName}`, executable, args: ["run", scriptName] });
  });
  ipcMain.handle("projects:processes", () => listProcesses());
  ipcMain.handle("projects:stop-process", async (_event, processId: unknown) => {
    if (typeof processId !== "string") throw new Error("Invalid process id.");
    await stopProcess(processId);
  });
  ipcMain.handle("packages:search", async (_event, query: unknown) => {
    if (typeof query !== "string" || query.length > 100) throw new Error("Invalid package search.");
    return searchPackages(query);
  });
  ipcMain.handle("packages:dependencies", async (_event, projectId: unknown) => readDependencies(getProject(projectId).path));
  ipcMain.handle("packages:install", async (_event, projectId: unknown, packageName: unknown, development: unknown) => {
    const project = getProject(projectId);
    if (typeof packageName !== "string" || !/^(?:@[\w.-]+\/)?[\w.-]+$/.test(packageName)) throw new Error("Invalid package name.");
    const manager = project.packageManager ?? "npm";
    const executable = process.platform === "win32" ? `${manager}.cmd` : manager;
    return startProcess({ projectId: project.id, cwd: project.path, label: `Install ${packageName}`, executable, args: ["install", development === true ? "-D" : "", packageName].filter(Boolean) });
  });
  ipcMain.handle("packages:remove", async (_event, projectId: unknown, packageName: unknown) => {
    const project = getProject(projectId);
    if (typeof packageName !== "string" || !/^(?:@[\w.-]+\/)?[\w.-]+$/.test(packageName)) throw new Error("Invalid package name.");
    const manager = project.packageManager ?? "npm";
    const executable = process.platform === "win32" ? `${manager}.cmd` : manager;
    return startProcess({ projectId: project.id, cwd: project.path, label: `Remove ${packageName}`, executable, args: ["uninstall", packageName] });
  });
  ipcMain.handle("creation:select-destination", async () => {
    const options: OpenDialogOptions = { properties: ["openDirectory", "createDirectory"], title: "Choose a project destination" };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle("creation:create", async (_event, request: CreateProjectRequest) => {
    if (!request || typeof request.name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(request.name)) throw new Error("Invalid project name.");
    if (!["node", "typescript", "vite", "next"].includes(request.template)) throw new Error("Unsupported template.");
    if (!["npm", "pnpm", "yarn"].includes(request.packageManager)) throw new Error("Unsupported package manager.");
    const destination = path.resolve(request.destination);
    await access(destination);
    const target = path.join(destination, request.name);
    try { await access(target); throw new Error("A directory with that name already exists."); } catch (error) { if (error instanceof Error && error.message.includes("already exists")) throw error; }
    if (request.template === "node" || request.template === "typescript") {
      await mkdir(target, { recursive: false });
      await writeFile(path.join(target, "package.json"), JSON.stringify({ name: request.name, version: "1.0.0", private: true, scripts: request.template === "typescript" ? { build: "tsc" } : {}, ...(request.template === "typescript" ? { devDependencies: { typescript: "^5.0.0" } } : {}) }, null, 2));
      if (request.template === "typescript") {
        await mkdir(path.join(target, "src"));
        await writeFile(path.join(target, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "CommonJS", strict: true, outDir: "dist" }, include: ["src"] }, null, 2));
        await writeFile(path.join(target, "src", "index.ts"), 'console.log("Hello from npmUI");\n');
      }
      return startProcess({ projectId: target.toLowerCase(), cwd: target, label: "Install dependencies", executable: process.platform === "win32" ? `${request.packageManager}.cmd` : request.packageManager, args: ["install"] });
    }
    const executable = process.platform === "win32" ? `${request.packageManager}.cmd` : request.packageManager;
    const args = request.template === "vite"
      ? ["create", "vite@latest", request.name, "--", "--template", "react-ts"]
      : ["create", "next-app@latest", request.name, "--", "--typescript", "--eslint", "--app"];
    return startProcess({ projectId: target.toLowerCase(), cwd: destination, label: `Create ${request.template} project`, executable, args });
  });
  ipcMain.handle("terminal:create", async (_event, cwd: unknown, shellId: unknown) => {
    if (cwd !== undefined && typeof cwd !== "string") throw new Error("Invalid terminal directory.");
    if (shellId !== undefined && typeof shellId !== "string") throw new Error("Invalid shell profile.");
    const profiles = await readShellProfiles();
    const settings = await getSettings();
    const profile = profiles.find((item) => item.id === (shellId ?? settings.preferredShell)) ?? profiles[0];
    return createTerminal(cwd || defaultTerminalDirectory(), profile);
  });
  ipcMain.handle("terminal:write", (_event, id: unknown, data: unknown) => {
    if (typeof id !== "string" || typeof data !== "string" || data.length > 20_000) throw new Error("Invalid terminal input.");
    writeTerminal(id, data);
  });
  ipcMain.handle("terminal:resize", (_event, id: unknown, columns: unknown, rows: unknown) => {
    if (typeof id !== "string" || typeof columns !== "number" || typeof rows !== "number") throw new Error("Invalid terminal size.");
    resizeTerminal(id, columns, rows);
  });
  ipcMain.handle("terminal:close", (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("Invalid terminal id.");
    closeTerminal(id);
  });
  ipcMain.handle("terminal:open-window", (_event, cwd: unknown, shellId: unknown) => {
    if (cwd !== undefined && typeof cwd !== "string") throw new Error("Invalid terminal directory.");
    if (shellId !== undefined && typeof shellId !== "string") throw new Error("Invalid shell profile.");
    createTerminalWindow(cwd, shellId);
  });
  setTerminalListeners(
    (event) => {
      mainWindow?.webContents.send("terminal:data", event);
      terminalWindow?.webContents.send("terminal:data", event);
    },
    (event) => {
      mainWindow?.webContents.send("terminal:exit", event);
      terminalWindow?.webContents.send("terminal:exit", event);
    }
  );
  setProcessListener((record) => mainWindow?.webContents.send("process:update", record));
}

app.whenReady().then(async () => {
  registerIpc();
  await refreshProjects();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
