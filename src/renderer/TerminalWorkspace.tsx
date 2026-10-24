import { useEffect, useRef, useState } from "react";
import { Maximize2, Plus, Terminal as TerminalIcon, X } from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import type { AppSettings, ShellProfile, TerminalSession } from "../shared/contracts";
import "@xterm/xterm/css/xterm.css";

interface TerminalTab {
  session: TerminalSession;
  title: string;
}

function shellGlyph(profile: ShellProfile | undefined, name: string): string {
  if (profile?.icon) return profile.icon;
  const normalized = name.toLowerCase();
  if (normalized.includes("git")) return "⌁";
  if (normalized.includes("power")) return "PS";
  if (normalized.includes("command") || normalized === "cmd") return ">_";
  if (normalized.includes("ubuntu") || normalized.includes("linux")) return "🐧";
  return "⌘";
}

export default function TerminalWorkspace({ initialCwd, settings, detached = false, onClose }: { initialCwd?: string; settings?: AppSettings; detached?: boolean; onClose?: () => void }): JSX.Element {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [shells, setShells] = useState<ShellProfile[]>([]);
  const [shellMenuOpen, setShellMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [terminalSettings, setTerminalSettings] = useState(settings);
  const activeIdRef = useRef<string | null>(null);
  const terminals = useRef(new Map<string, { terminal: Terminal; fit: FitAddon; element: HTMLDivElement }>());
  const surfaces = useRef(new Map<string, HTMLDivElement>());
  const firstCwd = useRef(initialCwd);

  useEffect(() => {
    if (settings) setTerminalSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!shellMenuOpen) return;
    const dismiss = (event: MouseEvent): void => {
      if (!(event.target as HTMLElement).closest(".new-tab-control")) setShellMenuOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setShellMenuOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [shellMenuOpen]);

  async function addTab(cwd?: string, shellId?: string): Promise<void> {
    try {
      setError(null);
      const session = await window.npmui.terminal.create(cwd, shellId);
      setTabs((current) => [...current, { session, title: session.cwd.split(/[\\/]/).pop() || "Terminal" }]);
      setActiveId(session.id);
      activeIdRef.current = session.id;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The shell could not be started.");
    }
  }
  async function closeTab(id: string): Promise<void> {
    await window.npmui.terminal.close(id);
    terminals.current.get(id)?.terminal.dispose();
    terminals.current.delete(id);
    setTabs((current) => {
      const next = current.filter((tab) => tab.session.id !== id);
      const fallback = next[0]?.session.id ?? null;
      setActiveId(fallback);
      activeIdRef.current = fallback;
      return next;
    });
  }
  useEffect(() => { void window.npmui.settings.shells().then(setShells); if (!settings) void window.npmui.settings.get().then(setTerminalSettings); void addTab(firstCwd.current); return () => { for (const id of terminals.current.keys()) void window.npmui.terminal.close(id); }; }, []);
  useEffect(() => {
    const disposeData = window.npmui.terminal.onData(({ id, data }) => terminals.current.get(id)?.terminal.write(data));
    const disposeExit = window.npmui.terminal.onExit(({ id }) => terminals.current.get(id)?.terminal.write("\r\n[process exited]\r\n"));
    return () => { disposeData(); disposeExit(); };
  }, []);
  useEffect(() => {
    const tab = tabs.find((item) => item.session.id === activeId);
    if (!tab) return;
    const container = surfaces.current.get(tab.session.id);
    if (!container || terminals.current.has(tab.session.id)) return;
    const appearance = terminalSettings;
    const terminal = new Terminal({ cursorBlink: true, convertEol: true, fontFamily: appearance?.terminalFontFamily ?? "Cascadia Code, Consolas, monospace", fontSize: appearance?.terminalFontSize ?? 13, theme: { background: appearance?.terminalBackground ?? "#17151f", foreground: appearance?.terminalForeground ?? "#e8e1f4", cursor: appearance?.terminalForeground ?? "#e8e1f4", selectionBackground: "#8066a466" }, scrollback: 5000 });
    const fit = new FitAddon();
    terminal.loadAddon(fit); terminal.open(container); fit.fit();
    terminal.focus();
    terminal.onData((data) => void window.npmui.terminal.write(tab.session.id, data));
    terminals.current.set(tab.session.id, { terminal, fit, element: container });
    void window.npmui.terminal.resize(tab.session.id, terminal.cols, terminal.rows);
    return () => undefined;
  }, [tabs, activeId, terminalSettings]);
  useEffect(() => {
    const id = activeId;
    const current = id ? terminals.current.get(id) : undefined;
    if (current && id) {
      current.terminal.focus();
      current.fit.fit();
      void window.npmui.terminal.resize(id, current.terminal.cols, current.terminal.rows);
    }
  }, [activeId]);
  useEffect(() => {
    const resize = (): void => { const current = activeId ? terminals.current.get(activeId) : undefined; if (current && activeId) { current.fit.fit(); void window.npmui.terminal.resize(activeId, current.terminal.cols, current.terminal.rows); } };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [activeId]);

  return <div className={`terminal-workspace ${detached ? "terminal-detached" : ""}`}>
    <div className="terminal-toolbar"><div className="terminal-title"><TerminalIcon size={15} /><span>Terminal</span></div><div className="terminal-controls"><div className="new-tab-control"><button onClick={() => void addTab(initialCwd)} onContextMenu={(event) => { event.preventDefault(); setShellMenuOpen((current) => !current); }} title="New terminal (right-click for shell choice)"><Plus size={15} /></button>{shellMenuOpen && <div className="shell-menu">{shells.map((shell) => <button key={shell.id} onClick={() => { setShellMenuOpen(false); void addTab(initialCwd, shell.id); }}><ShellIcon profile={shell} /><span>{shell.name}</span></button>)}</div>}</div>{!detached && <button onClick={() => void window.npmui.terminal.openWindow(initialCwd)} title="Open in window"><Maximize2 size={14} /></button>}{onClose && <button onClick={onClose} title="Hide terminal"><X size={15} /></button>}</div></div>
    <div className="terminal-tabs">{tabs.map((tab) => { const profile = shells.find((shell) => shell.id === tab.session.shellId); return <button className={tab.session.id === activeId ? "active" : ""} key={tab.session.id} onClick={() => { setActiveId(tab.session.id); activeIdRef.current = tab.session.id; }}><ShellIcon profile={profile} name={tab.session.shell} /><span>{tab.title}</span><X size={12} onClick={(event) => { event.stopPropagation(); void closeTab(tab.session.id); }} /></button>; })}</div>
    <div className="terminal-surfaces" onClick={() => { const current = activeId ? terminals.current.get(activeId) : undefined; current?.terminal.focus(); }}>{error ? <div className="terminal-error"><strong>Terminal unavailable</strong><span>{error}</span><button className="secondary-button" onClick={() => void addTab(initialCwd)}>Retry shell</button></div> : tabs.map((tab) => <div className={`terminal-surface ${tab.session.id === activeId ? "visible" : ""}`} key={tab.session.id} ref={(element) => { if (element) surfaces.current.set(tab.session.id, element); else surfaces.current.delete(tab.session.id); }}><span className="terminal-loading">Starting shell…</span></div>)}</div>
  </div>;
}

function ShellIcon({ profile, name }: { profile?: ShellProfile; name?: string }): JSX.Element {
  const [failed, setFailed] = useState(false);
  const label = name ?? profile?.name ?? "Shell";
  if (profile?.icon && !failed) return <img className="shell-icon" src={profile.icon} alt="" onError={() => setFailed(true)} />;
  return <span className="shell-glyph" title={label}>{shellGlyph(undefined, label)}</span>;
}
