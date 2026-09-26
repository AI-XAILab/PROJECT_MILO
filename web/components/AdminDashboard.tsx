"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Banknote, Building2, FileText, LoaderCircle, MonitorPlay, Trash2, UploadCloud } from "lucide-react";
import { KNOWLEDGE_BASES, type KnowledgeBase } from "../lib/knowledge-bases";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

type DocumentItem = {
  id: string;
  knowledgeBase: KnowledgeBase;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
};

type Feedback = { message: string; isError: boolean };

const icons = [Banknote, Building2, MonitorPlay];
const acceptedFileTypes = ".pdf,.txt,.md,.docx";

async function requestDocuments(knowledgeBase: KnowledgeBase): Promise<DocumentItem[]> {
  const response = await fetch(`/api/admin/documents?knowledgeBase=${knowledgeBase}`, { cache: "no-store" });
  const result = await response.json() as { documents?: DocumentItem[]; error?: string };
  if (!response.ok || !Array.isArray(result.documents)) {
    throw new Error(result.error || "Documents could not be loaded.");
  }
  return result.documents;
}

function formatFileSize(size: number) {
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function AdminDashboard() {
  const [documents, setDocuments] = useState<Record<KnowledgeBase, DocumentItem[]>>({ banks: [], power: [], media: [] });
  const [loading, setLoading] = useState(true);
  const [unavailableBases, setUnavailableBases] = useState<KnowledgeBase[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all(KNOWLEDGE_BASES.map(async base => {
      try {
        return { knowledgeBase: base.value, documents: await requestDocuments(base.value), failed: false };
      } catch {
        return { knowledgeBase: base.value, documents: [], failed: true };
      }
    })).then(results => {
      if (!active) return;
      setDocuments(Object.fromEntries(results.map(result => [result.knowledgeBase, result.documents])) as Record<KnowledgeBase, DocumentItem[]>);
      setUnavailableBases(results.filter(result => result.failed).map(result => result.knowledgeBase));
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function refreshDocuments(knowledgeBase: KnowledgeBase) {
    try {
      const nextDocuments = await requestDocuments(knowledgeBase);
      setDocuments(current => ({ ...current, [knowledgeBase]: nextDocuments }));
      setUnavailableBases(current => current.filter(value => value !== knowledgeBase));
    } catch {
      setUnavailableBases(current => current.includes(knowledgeBase) ? current : [...current, knowledgeBase]);
      throw new Error("The document list could not be refreshed.");
    }
  }

  const totalDocuments = Object.values(documents).reduce((total, list) => total + list.length, 0);
  const connectionStatus = loading ? "Connecting" : unavailableBases.length ? "Connection issue" : "Connected";

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">ADMIN CONTROL</p>
          <h1>Knowledge Base Dashboard</h1>
        </div>
        <Badge className="admin-status-pill">{connectionStatus}</Badge>
      </div>

      <div className="admin-metrics">
        {[
          { label: "Documents", value: String(totalDocuments) },
          { label: "Status", value: connectionStatus },
          { label: "Active", value: "3 knowledge bases" },
        ].map(item => (
          <div key={item.label} className="admin-metric">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <div className="admin-grid">
        {KNOWLEDGE_BASES.map((base, index) => {
          const Icon = icons[index];
          return (
            <KnowledgeBaseCard
              key={base.value}
              base={base}
              icon={Icon}
              documents={documents[base.value]}
              loading={loading}
              unavailable={unavailableBases.includes(base.value)}
              onRefresh={refreshDocuments}
            />
          );
        })}
      </div>
    </div>
  );
}

function KnowledgeBaseCard({
  base,
  icon: Icon,
  documents,
  loading,
  unavailable,
  onRefresh,
}: {
  base: (typeof KNOWLEDGE_BASES)[number];
  icon: (typeof icons)[number];
  documents: DocumentItem[];
  loading: boolean;
  unavailable: boolean;
  onRefresh: (knowledgeBase: KnowledgeBase) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function upload(file: File) {
    if (uploading) return;
    setUploading(true);
    setFeedback({ message: `Processing ${file.name}...`, isError: false });

    const formData = new FormData();
    formData.set("knowledgeBase", base.value);
    formData.set("file", file);

    try {
      const response = await fetch("/api/admin/documents", { method: "POST", body: formData });
      const result = await response.json() as { error?: string; chunkCount?: number; document?: DocumentItem };
      if (!response.ok) {
        setFeedback({ message: result.error || "The document could not be uploaded.", isError: true });
        return;
      }

      setFeedback({ message: `Uploaded and processed ${result.document?.fileName || file.name} (${result.chunkCount ?? 0} chunks).`, isError: false });
      try {
        await onRefresh(base.value);
      } catch {
        setFeedback({ message: "Upload succeeded, but the document list could not be refreshed.", isError: true });
      }
    } catch {
      setFeedback({ message: "Upload failed. Check your connection and try again.", isError: true });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file) void upload(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (uploading) return;
    if (event.dataTransfer.files.length !== 1) {
      setFeedback({ message: "Upload one document at a time.", isError: true });
      return;
    }
    const file = event.dataTransfer.files[0];
    if (file) void upload(file);
  }

  async function removeDocument(document: DocumentItem) {
    if (deletingId || !window.confirm(`Delete ${document.fileName}? This cannot be undone.`)) return;
    setDeletingId(document.id);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/documents/${encodeURIComponent(document.id)}?knowledgeBase=${base.value}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setFeedback({ message: result.error || "The document could not be deleted.", isError: true });
        return;
      }
      setFeedback({ message: `Deleted ${document.fileName}.`, isError: false });
      await onRefresh(base.value);
    } catch {
      setFeedback({ message: "Delete failed. Check your connection and try again.", isError: true });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <article className="milo-card knowledge-card" data-knowledge-base={base.value}>
      <div className="knowledge-card-header">
        <div className="knowledge-card-icon">
          <Icon size={18} />
        </div>
        <div>
          <h2>{base.label}</h2>
          <p>{base.description}</p>
        </div>
      </div>

      <div className="knowledge-card-meta">
        <div>
          <span>Documents</span>
          <strong>{documents.length}</strong>
        </div>
        <div>
          <span>Status</span>
          <Badge className="knowledge-status">{uploading ? "Processing" : unavailable ? "Unavailable" : "Ready"}</Badge>
        </div>
      </div>

      <div className="upload-panel" aria-label={`${base.label} upload area`}>
        <div className="upload-panel-header">
          <UploadCloud size={16} />
          <span>Manage documents</span>
        </div>
        <div
          className={`upload-dropzone${dragging ? " is-dragging" : ""}`}
          onDragOver={event => { event.preventDefault(); if (!uploading) setDragging(true); }}
          onDragLeave={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            className="document-file-input"
            type="file"
            accept={acceptedFileTypes}
            aria-label={`Select document for ${base.label}`}
            disabled={uploading}
            onChange={handleFileSelection}
          />
          {uploading ? <LoaderCircle className="document-spinner" size={20} aria-hidden="true" /> : <FileText size={20} />}
          <p>{uploading ? "Processing document..." : "Drag and drop one document here"}</p>
          <small>PDF, TXT, Markdown, or DOCX. Maximum file size: 10 MB.</small>
          <Button type="button" variant="secondary" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? "Processing..." : "Choose a document"}
          </Button>
        </div>
        {feedback && (
          <p className={`document-feedback${feedback.isError ? " is-error" : ""}`} role={feedback.isError ? "alert" : "status"}>
            {feedback.message}
          </p>
        )}
      </div>

      <div className="document-list-placeholder">
        <span>Uploaded documents ({documents.length})</span>
        {loading ? <p className="document-list-empty">Loading documents...</p> : documents.length ? (
          <ul className="document-list">
            {documents.map(document => (
              <li key={document.id}>
                <div className="document-list-row">
                  <div className="document-list-info">
                    <span title={document.fileName}>{document.fileName}</span>
                    <small>{document.fileName.split(".").pop()?.toUpperCase()} · {formatFileSize(document.fileSize)}</small>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="document-delete-button"
                    aria-label={`Delete ${document.fileName}`}
                    title={`Delete ${document.fileName}`}
                    disabled={deletingId === document.id || Boolean(deletingId)}
                    onClick={() => void removeDocument(document)}
                  >
                    {deletingId === document.id ? <LoaderCircle className="document-spinner" size={15} /> : <Trash2 size={15} />}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="document-list-empty">No documents yet.</p>}
      </div>
    </article>
  );
}
