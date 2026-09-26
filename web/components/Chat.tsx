"use client";

import { useEffect, useRef, useState } from "react";
import { conversationRepository, createConversation, createMessage, type ChatStore, type Conversation } from "../lib/conversations";
import { DEFAULT_KNOWLEDGE_BASE, type KnowledgeBase } from "../lib/knowledge-bases";
import Sidebar, { type View } from "./Sidebar";
import WelcomeScreen, { suggestions } from "./WelcomeScreen";
import ChatInput from "./ChatInput";
import MessageBubble from "./MessageBubble";
import MiloAvatar from "./MiloAvatar";
import AboutMilo from "./AboutMilo";
import Settings, { type Theme } from "./Settings";
import Icon from "./Icon";
import { KnowledgeBaseSelector } from "./KnowledgeBaseSelector";

const initialStore: ChatStore = { version: 1, conversations: [], activeId: null };
export default function Chat() {
  const [store, setStore] = useState<ChatStore>(initialStore);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [input, setInput] = useState("");
  const [view, setView] = useState<View>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [theme, setTheme] = useState<Theme>("midnight");
  const [selectedKnowledgeBase, setSelectedKnowledgeBase] = useState<KnowledgeBase>(DEFAULT_KNOWLEDGE_BASE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const storageWritable = useRef(true);
  const bottom = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const active = store.conversations.find(c => c.id === store.activeId);
  const messages = active?.messages ?? [];
  const activeKnowledgeBase = active?.knowledgeBase ?? selectedKnowledgeBase;

  useEffect(() => {
    let restored = initialStore;
    let warning = "";
    try { restored = conversationRepository.load(); }
    catch { storageWritable.current = false; warning = "Saved history could not be read. This session will stay in memory; existing browser data has been left untouched."; }
    let savedTheme: Theme = "midnight";
    try { if (localStorage.getItem("milo-theme") === "dusk") savedTheme = "dusk"; } catch { /* Memory-only settings still work. */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate browser storage after SSR.
    setStore(restored);
    setSelectedKnowledgeBase(restored.conversations.find(c => c.id === restored.activeId)?.knowledgeBase ?? DEFAULT_KNOWLEDGE_BASE);
    setTheme(savedTheme);
    setStorageError(warning);
    const media = window.matchMedia("(max-width: 760px)");
    setMobile(media.matches);
    setSidebarOpen(!media.matches);
    const onResize = () => { setMobile(media.matches); setSidebarOpen(!media.matches); };
    media.addEventListener("change", onResize);
    setReady(true);
    return () => { controller.current?.abort(); media.removeEventListener("change", onResize); };
  }, []);

  useEffect(() => {
    if (!ready || !storageWritable.current) return;
    try { conversationRepository.save(store); }
    catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Surface external storage failures.
      setStorageError("Browser storage is full or unavailable. Chat still works, but the latest changes may not survive a refresh.");
    }
  }, [store, ready]);

  useEffect(() => {
    if (!messages.length || view !== "chat") return;
    bottom.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "end" });
  }, [messages.length, loading, store.activeId, view]);

  const closeMobile = () => { if (window.innerWidth <= 760) setSidebarOpen(false); };
  function showView(next: View) { setView(next); closeMobile(); }
  function saveConversation(c: Conversation) {
    setStore(prev => ({ version: 1, activeId: c.id, conversations: [c, ...prev.conversations.filter(item => item.id !== c.id)] }));
  }
  function newChat() {
    if (sending.current || !ready) return;
    const empty = store.conversations.find(c => !c.messages.length);
    if (empty) setStore(prev => ({ ...prev, activeId: empty.id }));
    else saveConversation(createConversation({ knowledgeBase: activeKnowledgeBase }));
    setInput(""); setError(""); showView("chat");
  }
  function selectChat(id: string) {
    if (sending.current) return;
    setStore(prev => ({ ...prev, activeId: id }));
    setInput(""); setError(""); showView("chat");
  }
  function deleteChat(id: string) {
    if (sending.current || !window.confirm("Delete this conversation? This cannot be undone.")) return;
    setStore(prev => {
      const conversations = prev.conversations.filter(c => c.id !== id);
      return { ...prev, conversations, activeId: prev.activeId === id ? conversations[0]?.id ?? null : prev.activeId };
    });
    if (id === store.activeId) { setInput(""); setError(""); }
  }
  function clearCurrent() {
    if (!active || sending.current || !window.confirm("Clear all messages in this conversation?")) return;
    saveConversation({ ...active, title: "New conversation", messages: [], updatedAt: new Date().toISOString() });
    setError(""); setInput("");
  }
  function clearAll() {
    if (sending.current || !window.confirm("Delete all conversations saved in this browser? This cannot be undone.")) return;
    storageWritable.current = true;
    setStore(initialStore); setInput(""); setError(""); setStorageError("");
    try { sessionStorage.removeItem("milo-chat-v2"); } catch { /* Empty store takes precedence over legacy data. */ }
  }
  function changeTheme(next: Theme) {
    setTheme(next);
    try { localStorage.setItem("milo-theme", next); }
    catch { setStorageError("Theme changed for this session. Browser storage is unavailable."); }
  }
  function changeKnowledgeBase(next: KnowledgeBase) {
    if (sending.current) return;
    setSelectedKnowledgeBase(next);
    if (!active) return;
    setStore(prev => ({
      ...prev,
      conversations: prev.conversations.map(conversation => conversation.id === active.id
        ? { ...conversation, knowledgeBase: next, updatedAt: new Date().toISOString() }
        : conversation),
    }));
  }
  async function send(text = input, retry = false) {
    if (!ready || sending.current || (!retry && !text.trim())) return;
    const c = active ?? createConversation({ knowledgeBase: activeKnowledgeBase });
    if (!c.knowledgeBase) {
      setError("Select a knowledge base before sending a document-grounded question.");
      return;
    }
    if (retry && c.messages.at(-1)?.role !== "user") return;
    const next = retry ? c.messages : [...c.messages, createMessage("user", text.trim())];
    const pending = { ...c, messages: next, title: c.messages.length ? c.title : text.trim().slice(0, 48), updatedAt: new Date().toISOString() };
    sending.current = true; setLoading(true); setError(""); setInput(""); showView("chat"); saveConversation(pending);
    const request = new AbortController(); controller.current = request;
    const timeout = setTimeout(() => request.abort(), 45_000);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, signal: request.signal, body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })), knowledgeBase: c.knowledgeBase }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "MILO couldn’t connect. Please try again.");
      if (typeof data.reply !== "string" || !data.reply.trim()) throw new Error("MILO’s reply was empty. Please try again.");
      saveConversation({ ...pending, messages: [...next, createMessage("assistant", data.reply, Array.isArray(data.sources) ? data.sources : undefined)], updatedAt: new Date().toISOString() });
    } catch (e) {
      setError(request.signal.aborted ? "The connection took too long. Your message is saved; you can try again." : e instanceof Error ? e.message : "Connection interrupted. Please try again.");
    } finally { clearTimeout(timeout); controller.current = null; sending.current = false; setLoading(false); }
  }

  return <div className={`app-shell theme-${theme} ${sidebarOpen ? "sidebar-is-open" : "sidebar-is-closed"}`}>
    {sidebarOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <Sidebar conversations={store.conversations} activeId={store.activeId} view={view} open={sidebarOpen} disabled={loading || !ready} onToggle={() => setSidebarOpen(false)} onNew={newChat} onSelect={selectChat} onDelete={deleteChat} onView={showView} />
    <main className="workspace" inert={mobile && sidebarOpen}><header className="topbar"><div className="topbar-title"><button className="icon-button" aria-label={sidebarOpen ? "Collapse sidebar" : "Open sidebar"} aria-controls="sidebar" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}><Icon name="panel" /></button><span>{view === "chat" ? "Your workspace" : view === "about" ? "About MILO" : view === "explore" ? "Explore MILO" : "Settings"}</span><span className="topbar-divider">/</span><span className="topbar-subtitle">{view === "chat" ? active?.title ?? "A new beginning" : "PROJECT_MILO"}</span></div><div className="topbar-actions">{view === "chat" && <KnowledgeBaseSelector value={activeKnowledgeBase} onChange={changeKnowledgeBase} disabled={!ready || loading} />}{view === "chat" && messages.length > 0 && <button className="text-button" disabled={loading} onClick={clearCurrent}>Clear chat</button>}<span className="private-badge"><span className="status-dot" /> LOCAL HISTORY</span></div></header>
      {storageError && <div className="storage-warning" role="status">{storageError}</div>}
      {view === "chat" ? <><div className="chat-scroll">{messages.length === 0 ? <WelcomeScreen onSend={text => void send(text)} disabled={!ready || loading} /> : <div className="conversation"><div className="conversation-heading"><span className="eyebrow">A CONVERSATION WITH MILO</span><p>Let’s see where curiosity takes us.</p></div><div role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions">{messages.map(message => <MessageBubble key={message.id} message={message} />)}{loading && <div className="typing" role="status"><MiloAvatar /><div><span>MILO is thinking</span><span className="typing-dots"><i /><i /><i /></span></div></div>}</div></div>}<div ref={bottom} /></div><div className="chat-footer">{error && <div className="api-error" role="alert"><span>{error}</span><button disabled={loading} onClick={() => void send("", true)}>Retry message ↗</button></div>}{!loading && !error && messages.at(-1)?.role === "user" && <div className="pending-reply"><span>This message hasn’t received a reply.</span><button onClick={() => void send("", true)}>Retry message ↗</button></div>}<ChatInput value={input} onChange={setInput} onSend={() => void send()} disabled={!ready || loading} loading={loading} /></div></> : <div className="page-scroll" key={view}>{view === "about" ? <AboutMilo /> : view === "settings" ? <Settings theme={theme} onTheme={changeTheme} onClear={clearAll} disabled={!ready || loading} count={store.conversations.length} /> : <div className="content-page"><div className="eyebrow">FOLLOW YOUR CURIOSITY</div><h1>A robot with a story.<br /><span>A partner for your ideas.</span></h1><p className="page-lead">Get to know MILO, untangle a problem, or start building something of your own.</p><div className="explore-grid">{[...suggestions, { title: "A warehouse of possibilities", subtitle: "Find out what comes next.", prompt: "What are you building in Robat Karim?", icon: "spark" as const }, { title: "Bring your own big idea", subtitle: "Turn a spark into a practical first step.", prompt: "Help me brainstorm a small creative project I can build this weekend.", icon: "plus" as const }].map(s => <button className="suggestion" key={s.title} disabled={!ready || loading} onClick={() => void send(s.prompt)}><Icon name={s.icon} /><strong>{s.title}<span>↗</span></strong><p>{s.subtitle}</p></button>)}</div><button className="text-button story-link" onClick={() => showView("about")}>Read MILO’s fictional story →</button></div>}</div>}
    </main></div>;
}

