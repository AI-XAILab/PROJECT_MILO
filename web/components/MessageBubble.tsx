import type { ChatMessage } from "../lib/conversations";
import MiloAvatar from "./MiloAvatar";
export default function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <article className={`message ${message.role}`}>
      {message.role === "assistant" && <MiloAvatar />}
      <div className="message-body">
        <div className="message-meta">
          <strong>{message.role === "user" ? "You" : "MILO"}</strong>
          {message.role === "assistant" && <span className="message-badge">YOUR ROBOT ALLY</span>}
          <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
        </div>
        <div className="message-text" dir="auto">{message.content}</div>
        {message.role === "assistant" && message.sources?.length ? (
          <details className="message-sources">
            <summary>Sources ({message.sources.length})</summary>
            <ol>
              {message.sources.map((source, index) => (
                <li key={`${source.documentName}-${source.chunkIndex}-${index}`}>
                  <strong>{source.documentName}</strong>
                  {source.pageNumber !== null && <span> · Page {source.pageNumber}</span>}
                  <p>{source.text.length > 320 ? `${source.text.slice(0, 320).trimEnd()}...` : source.text}</p>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    </article>
  );
}
