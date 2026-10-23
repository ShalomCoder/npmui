import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, NpmuiApi } from "../shared/contracts";

const api: NpmuiApi = {
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    selectDirectory: () => ipcRenderer.invoke("projects:select-directory"),
    refresh: () => ipcRenderer.invoke("projects:refresh"),
    openInExplorer: (projectId) => ipcRenderer.invoke("projects:open-explorer", projectId),
    openInVscode: (projectId) => ipcRenderer.invoke("projects:open-vscode", projectId),
    runScript: (projectId, scriptName) => ipcRenderer.invoke("projects:run-script", projectId, scriptName),
    stopProcess: (processId) => ipcRenderer.invoke("projects:stop-process", processId),
    processes: () => ipcRenderer.invoke("projects:processes"),
    onProcessOutput: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, process: Parameters<typeof listener>[0]) => listener(process);
      ipcRenderer.on("process:update", handler);
      return () => ipcRenderer.removeListener("process:update", handler);
    }
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (settings: AppSettings) => ipcRenderer.invoke("settings:update", settings),
    detectTools: () => ipcRenderer.invoke("settings:detect-tools")
  },
  packages: {
    search: (query) => ipcRenderer.invoke("packages:search", query),
    dependencies: (projectId) => ipcRenderer.invoke("packages:dependencies", projectId),
    install: (projectId, packageName, development) => ipcRenderer.invoke("packages:install", projectId, packageName, development),
    remove: (projectId, packageName) => ipcRenderer.invoke("packages:remove", projectId, packageName)
  },
  creation: {
    selectDestination: () => ipcRenderer.invoke("creation:select-destination"),
    create: (request) => ipcRenderer.invoke("creation:create", request)
  }
};

contextBridge.exposeInMainWorld("npmui", api);
