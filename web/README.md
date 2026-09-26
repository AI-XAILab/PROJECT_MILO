# PROJECT_MILO — Version 2.1

The existing Next.js App Router chat, now with MILO's fictional identity, a responsive dark interface, and local conversation history. The Python CLI in `../chatbot.py` remains independent and unchanged.

## Run

From PROJECT_MILO in PowerShell:

```powershell
cd web
npm.cmd install
npm.cmd run dev
```

Open http://127.0.0.1:3000. Keep the existing `web/.env.local` and its `OPENAI_API_KEY`. Do not overwrite it with the example file. `OPENAI_MODEL` still optionally overrides `gpt-4.1-mini`. Restart the server after changing environment variables.

## Architecture

- `app/page.tsx` renders the chat workspace.
- `components/Chat.tsx` coordinates conversations, requests, navigation, and settings.
- `components/Sidebar`, `ChatInput`, `MessageBubble`, `WelcomeScreen`, `MiloAvatar`, `AboutMilo`, and `Settings` contain reusable views.
- `lib/conversations.ts` defines timestamped messages, conversations, a versioned store, validation, and the replaceable localStorage repository.
- `lib/milo-persona.ts` contains the private character instructions and imports `server-only`, preventing accidental client imports.
- `app/api/chat/route.ts` preserves the OpenAI Responses integration and supplies the persona on every request using `instructions`. Only user/assistant messages are accepted from the browser. Raw SDK errors are never returned.
- `app/globals.css` provides the responsive design, two dark palettes, CSS robot, and reduced-motion support.

No API keys or private prompt text are stored in the browser. The browser sends chat messages to `/api/chat`; that server endpoint alone calls OpenAI with `store: false`. The persona describes fictional aspirations, not implemented agents or physical capabilities. See [OpenAI's instructions documentation](https://developers.openai.com/api/docs/guides/text).

## History and settings

Conversations use `localStorage` under `milo-conversations-v1`, with `id`, `title`, `messages`, `createdAt`, and `updatedAt`. The active conversation survives refresh. The original `milo-chat-v2` session is migrated when no new store exists. Each browser has its own history; there is no database, account, sync, or cross-tab live synchronization. Concurrent tabs can overwrite each other's stored changes.

Unreadable saved history is preserved and the current session runs in memory. Storage failures display a warning. Clearing conversations requires confirmation. Theme preference uses `milo-theme`. Messages are transmitted to OpenAI when sent; local history is not an offline mode.

## Robot artwork

Optional: put a transparent PNG at `public/milo/milo-hero.png`. It appears on the welcome screen. Without it, a CSS robot and orbital visual appear automatically. The missing optional image can produce a harmless 404 in browser developer tools. No image-generation feature is included.

## Checks

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:e2e
```

The browser tests start the production server on port 3100 and use installed Microsoft Edge in headless mode. They mock successful chat responses and connection failures, so the test suite does not spend OpenAI credits. Route validation is tested against the real local server. TypeScript 6 is used because the current ESLint parser does not support TypeScript 7.

## Manual acceptance checks

1. Start the app; confirm the welcome screen and robot fallback appear. Click a suggestion and verify a live MILO response.
2. Ask who MILO is, his real name, why he escaped, who Axel is, where he is now, and what PROJECT_MILO means. Ask whether the escape really happened; he should clearly identify it as fiction.
3. Ask an unrelated practical question; MILO should help concisely without dumping the backstory.
4. Press Shift+Enter to insert a new line, then Enter to send. The send button disables and thinking dots appear while waiting.
5. Create two chats, switch between them, and refresh. Titles and messages should remain. Delete one chat, clear a chat, and use Settings to clear all history.
6. Simulate offline mode in browser developer tools, send a message, restore the network, and retry. The user message should not be duplicated.
7. Open About MILO and Explore MILO. Change the theme, then refresh to verify it persists.
8. At a narrow mobile width, open/close the sidebar and confirm the composer and navigation remain usable.
9. In the browser Network panel, verify chat requests go to `/api/chat` and carry only user/assistant content, with no API key or system prompt.

Long conversations are sent in full and may eventually exceed the configured model's context limit. Start a new conversation if that happens. Live replies require working network access, model access, and OpenAI quota.
