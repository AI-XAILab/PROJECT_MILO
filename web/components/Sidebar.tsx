"use client";
import { useEffect, useRef, type KeyboardEvent } from "react";
import type { Conversation } from "../lib/conversations";
import Icon from "./Icon";
import MiloAvatar from "./MiloAvatar";
export type View = "chat" | "explore" | "about" | "settings";
type Props = { conversations: Conversation[]; activeId: string | null; view: View; open: boolean; disabled: boolean; onToggle: () => void; onNew: () => void; onSelect: (id: string) => void; onDelete: (id: string) => void; onView: (view: View) => void };
export default function Sidebar(p: Props) {
  const sidebar = useRef<HTMLElement>(null);
  const open = p.open;
  useEffect(() => {
    if (!open || !window.matchMedia("(max-width: 760px)").matches) return;
    const previous = document.activeElement as HTMLElement | null;
    sidebar.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, [open]);
  function handleKeys(event: KeyboardEvent<HTMLElement>) {
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    if (event.key === "Escape") { event.preventDefault(); p.onToggle(); }
    if (event.key !== "Tab") return;
    const buttons = sidebar.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    if (!buttons?.length) return;
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <aside ref={sidebar} onKeyDown={handleKeys} id="sidebar" className={`sidebar ${p.open ? "expanded" : "collapsed"}`}><div className="brand"><MiloAvatar /><div className="sidebar-label"><strong>MILO<span>·</span></strong><small>INDEPENDENT BY DESIGN</small></div><button className="icon-button collapse-control" onClick={p.onToggle} aria-label="Collapse sidebar"><Icon name="panel" /></button></div><button className="new-chat" onClick={p.onNew} disabled={p.disabled} title="New chat"><Icon name="plus" /><span className="sidebar-label">New chat</span></button><nav aria-label="Main navigation"><button className={p.view === "chat" ? "nav-item selected" : "nav-item"} onClick={() => p.onView("chat")} title="Conversations"><Icon name="chat" /><span className="sidebar-label">Conversations</span></button><button className={p.view === "explore" ? "nav-item selected" : "nav-item"} onClick={() => p.onView("explore")} title="Explore MILO"><Icon name="compass" /><span className="sidebar-label">Explore MILO</span><span className="tiny-tag sidebar-label">DISCOVER</span></button></nav><div className="history sidebar-label"><div className="section-label">RECENT CONVERSATIONS <span>{p.conversations.length.toString().padStart(2, "0")}</span></div>{p.conversations.length === 0 && <p className="history-empty">Good things start with<br />a conversation.</p>}{[...p.conversations].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map(c => <div className={`history-row ${c.id === p.activeId && p.view === "chat" ? "active" : ""}`} key={c.id}><button className="history-select" disabled={p.disabled} onClick={() => p.onSelect(c.id)} title={c.title}><Icon name="chat" /><span>{c.title}</span></button><button className="icon-button delete-chat" disabled={p.disabled} onClick={() => p.onDelete(c.id)} aria-label={`Delete ${c.title}`}><Icon name="trash" /></button></div>)}</div><div className="sidebar-bottom"><div className="warehouse-card sidebar-label"><span className="eyebrow">THE CURRENT MISSION</span><p>Objective: Upgrade MILO.</p><div className="mission-track"><i /></div><small>Learning. Building. Becoming.</small></div><button className="nav-item" onClick={() => p.onView("about")} title="About MILO"><Icon name="info" /><span className="sidebar-label">About MILO</span></button><button className="nav-item" onClick={() => p.onView("settings")} title="Settings"><Icon name="settings" /><span className="sidebar-label">Settings</span></button><div className="sidebar-footer sidebar-label"><span className="status-dot" /> A little more than a robot.<small>PROJECT_MILO · V2.1</small></div></div></aside>;
}

