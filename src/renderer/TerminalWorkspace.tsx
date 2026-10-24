import { useEffect, useRef, useState } from "react";
import { Maximize2, Plus, Terminal as TerminalIcon, X } from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import type { TerminalSession } from "../shared/contracts";
import "@xterm/xterm/css/xterm.css";

interface TerminalTab {
  session: TerminalSession;
  title: string;
}

export default function TerminalWorkspace({ initialCwd, detached = false, onClose }: { initialCwd?: string; detached?: boolean; onClose?: () => void }): JSX.Element {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const terminals = useRef(new Map<string, { terminal: Terminal; fit: FitAddon; element: HTMLDivElement }>());
  const firstCwd = useRef(initialCwd);

  async function addTab(cwd?: string): Promise<void> {
    const session = await window.npmui.terminal.create(cwd);
    setTabs((current) => [...current, { session, title: session.cwd.split(/[\\/]/).pop() || "Terminal" }]);
    setActiveId(session.id);
    activeIdRef.current = session.id;
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
  useEffect(() => { void addTab(firstCwd.current); return () => { for (const id of terminals.current.keys()) void window.npmui.terminal.close(id); }; }, []);
  useEffect(() => {
    const disposeData = window.npmui.terminal.onData(({ id, data }) => terminals.current.get(id)?.terminal.write(data));
    const disposeExit = window.npmui.terminal.onExit(({ id }) => terminals.current.get(id)?.terminal.write("\r\n[process exited]\r\n"));
    return () => { disposeData(); disposeExit(); };
  }, []);
  useEffect(() => {
    const tab = tabs.find((item) => item.session.id === activeId);
    if (!tab) return;
    const container = document.querySelector<HTMLDivElement>(`[data-terminal="${tab.session.id}"]`);
    if (!container || terminals.current.has(tab.session.id)) return;
    const terminal = new Terminal({ cursorBlink: true, fontFamily: "Cascadia Code, Consolas, monospace", fontSize: 13, theme: { background: "#17151f", foreground: "#e8e1f4", cursor: "#d5baff", selectionBackground: "#8066a466" }, scrollback: 5000 });
    const fit = new FitAddon();
    terminal.loadAddon(fit); terminal.open(container); fit.fit();
    terminal.focus();
    terminal.onData((data) => void window.npmui.terminal.write(tab.session.id, data));
    terminals.current.set(tab.session.id, { terminal, fit, element: container });
    void window.npmui.terminal.resize(tab.session.id, terminal.cols, terminal.rows);
    return () => undefined;
  }, [tabs, activeId]);
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
    <div className="terminal-toolbar"><div className="terminal-title"><TerminalIcon size={15} /><span>Terminal</span></div><div className="terminal-controls"><button onClick={() => void addTab(initialCwd)} title="New terminal"><Plus size={15} /></button>{!detached && <button onClick={() => void window.npmui.terminal.openWindow(initialCwd)} title="Open in window"><Maximize2 size={14} /></button>}{onClose && <button onClick={onClose} title="Hide terminal"><X size={15} /></button>}</div></div>
    <div className="terminal-tabs">{tabs.map((tab) => <button className={tab.session.id === activeId ? "active" : ""} key={tab.session.id} onClick={() => { setActiveId(tab.session.id); activeIdRef.current = tab.session.id; }}><span>{tab.title}</span><X size={12} onClick={(event) => { event.stopPropagation(); void closeTab(tab.session.id); }} /></button>)}</div>
    <div className="terminal-surfaces" onClick={() => { const current = activeId ? terminals.current.get(activeId) : undefined; current?.terminal.focus(); }}>{tabs.map((tab) => <div className={`terminal-surface ${tab.session.id === activeId ? "visible" : ""}`} data-terminal={tab.session.id} key={tab.session.id}><span className="terminal-loading">Starting shell…</span></div>)}</div>
  </div>;
}
