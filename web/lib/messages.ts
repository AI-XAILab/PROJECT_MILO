export type Message = {
  role: "user" | "assistant";
  content: string;
};

export type ChatSource = {
  documentName: string;
  pageNumber: number | null;
  chunkIndex: number;
  text: string;
};

// Check both browser storage and API input before using them.
export function isMessageList(value: unknown): value is Message[] {
  return Array.isArray(value) && value.every((message) =>
    message !== null &&
    typeof message === "object" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0
  );
}
