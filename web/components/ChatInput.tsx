"use client";
import { useEffect, useRef } from "react";
import Icon from "./Icon";
export default function ChatInput({ value, onChange, onSend, disabled, loading }: { value: string; onChange: (value: string) => void; onSend: () => void; disabled: boolean; loading: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!disabled) ref.current?.focus(); }, [disabled]);
  useEffect(() => { if (ref.current) { ref.current.style.height = "auto"; ref.current.style.height = `${Math.min(ref.current.scrollHeight, 160)}px`; } }, [value]);
  return <div className="composer-area"><form className="composer" onSubmit={e => { e.preventDefault(); onSend(); }}><label htmlFor="message" className="sr-only">Message MILO</label><textarea id="message" ref={ref} rows={1} value={value} onChange={e => onChange(e.target.value)} placeholder="What are we building today?" disabled={disabled} maxLength={12000} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSend(); } }} /><button className="send-button" disabled={disabled || !value.trim()} aria-label={loading ? "Waiting for MILO" : "Send message"}><Icon name="arrow" /></button></form><div className="composer-note"><span>MILO is a fictional AI character. Big ideas, occasional mistakes.</span><span>Enter to send <b>·</b> Shift + Enter for a new line</span></div></div>;
}
