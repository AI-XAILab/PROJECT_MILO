import { DEFAULT_KNOWLEDGE_BASE, isKnowledgeBase, type KnowledgeBase } from "./knowledge-bases";
import { isMessageList, type ChatSource, type Message } from "./messages";

export type ChatMessage = Message & { id: string; createdAt: string; sources?: ChatSource[] };
export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  knowledgeBase: KnowledgeBase;
  createdAt: string;
  updatedAt: string;
};
export type ChatStore = { version: 1; activeId: string | null; conversations: Conversation[] };
export const STORAGE_KEY = "milo-conversations-v1";
const validDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object";

export function createMessage(role: Message["role"], content: string, sources?: ChatSource[]): ChatMessage {
  return { id: crypto.randomUUID(), role, content, createdAt: new Date().toISOString(), ...(sources?.length ? { sources } : {}) };
}
export function createConversation(overrides?: Partial<Pick<Conversation, "knowledgeBase">>): Conversation {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "New conversation",
    messages: [],
    knowledgeBase: overrides?.knowledgeBase ?? DEFAULT_KNOWLEDGE_BASE,
    createdAt: now,
    updatedAt: now,
  };
}
export function parseStore(raw: string): ChatStore {
  const value: unknown = JSON.parse(raw);
  if (!record(value) || value.version !== 1 || !Array.isArray(value.conversations)) throw new Error("Invalid history");
  const conversations: Conversation[] = value.conversations.map((c: unknown) => {
    if (!record(c) || typeof c.id !== "string" || typeof c.title !== "string" || !validDate(c.createdAt) || !validDate(c.updatedAt) || !isMessageList(c.messages)) throw new Error("Invalid conversation");
    const knowledgeBase = isKnowledgeBase(c.knowledgeBase) ? c.knowledgeBase : DEFAULT_KNOWLEDGE_BASE;
    const messages = c.messages.map((m: unknown) => {
      if (!record(m) || typeof m.id !== "string" || !validDate(m.createdAt)) throw new Error("Invalid message");
      const sources = Array.isArray(m.sources) && m.sources.every(isChatSource) ? m.sources : undefined;
      return { id: m.id, role: m.role, content: m.content, createdAt: m.createdAt, ...(sources?.length ? { sources } : {}) } as ChatMessage;
    });
    if (new Set(messages.map(m => m.id)).size !== messages.length) throw new Error("Duplicate messages");
    return { id: c.id, title: c.title, knowledgeBase, createdAt: c.createdAt, updatedAt: c.updatedAt, messages };
  });
  if (new Set(conversations.map(c => c.id)).size !== conversations.length) throw new Error("Duplicate conversations");
  return { version: 1, conversations, activeId: conversations.find(c => c.id === value.activeId)?.id ?? conversations[0]?.id ?? null };
}

// Replace this adapter when a database is introduced; UI uses the same model.
export const conversationRepository = {
  load(): ChatStore {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return parseStore(raw);
    const legacy = sessionStorage.getItem("milo-chat-v2");
    if (legacy) {
      const messages: unknown = JSON.parse(legacy);
      if (isMessageList(messages) && messages.length) {
        const c = createConversation();
        c.messages = messages.map(m => createMessage(m.role, m.content));
        c.title = messages.find(m => m.role === "user")?.content.slice(0, 48) || "Earlier conversation";
        return { version: 1, conversations: [c], activeId: c.id };
      }
    }
    return { version: 1, conversations: [], activeId: null };
  },
  save(store: ChatStore) { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); },
};

function isChatSource(value: unknown): value is ChatSource {
  if (!record(value)) return false;
  return typeof value.documentName === "string" &&
    (value.pageNumber === null || (Number.isInteger(value.pageNumber) && Number(value.pageNumber) > 0)) &&
    Number.isInteger(value.chunkIndex) && Number(value.chunkIndex) >= 0 &&
    typeof value.text === "string";
}
