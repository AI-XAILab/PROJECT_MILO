import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import type { KnowledgeBase } from "../lib/knowledge-bases";

const DOCUMENTS = [
  {
    knowledgeBase: "banks" as const,
    name: "MILO Bank's Aurora account has a withdrawal limit of 731 CHF per day.",
    file: "aurora-account.txt",
    vectorIndex: 0,
    pageNumber: null,
  },
  {
    knowledgeBase: "power" as const,
    name: "Helios Power Plant uses turbine model PX-900.",
    file: "helios-turbine.txt",
    vectorIndex: 1,
    pageNumber: 3,
  },
  {
    knowledgeBase: "media" as const,
    name: "Nova Television broadcasts its science program at 21:35.",
    file: "nova-broadcast.txt",
    vectorIndex: 2,
    pageNumber: null,
  },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function vector(index: number) {
  const values = Array<number>(1536).fill(0);
  values[index] = 1;
  return values;
}

function queryVectorIndex(query: string) {
  const normalized = query.toLowerCase();
  if (normalized.includes("aurora") || normalized.includes("withdrawal limit")) return 0;
  if (normalized.includes("helios") || normalized.includes("turbine") || normalized.includes("px-900")) return 1;
  if (normalized.includes("nova") || normalized.includes("science program") || normalized.includes("broadcast")) return 2;
  return 3;
}

async function listen(server: Server) {
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert(address && typeof address !== "string", "Could not reserve a local test port.");
  return address.port;
}

async function closeServer(server: Server) {
  await new Promise<void>(resolveClose => {
    server.close(() => resolveClose());
    server.closeAllConnections();
  });
}

async function reservePort() {
  const server = createServer();
  const port = await listen(server);
  await closeServer(server);
  return port;
}

async function waitForApp(baseURL: string, child: ChildProcess) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("The local Next.js test server stopped during startup.");
    try {
      const response = await fetch(`${baseURL}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(2000) });
      if (response.status === 400) return;
    } catch {
      await new Promise(resolveWait => setTimeout(resolveWait, 250));
    }
  }
  throw new Error("The local Next.js test server did not become ready.");
}

async function postChat(baseURL: string, knowledgeBase: KnowledgeBase, messages: { role: "user" | "assistant"; content: string }[]) {
  const response = await fetch(`${baseURL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ knowledgeBase, messages }),
  });
  return { status: response.status, body: await response.json() as { reply?: string; sources?: Array<{ documentName: string; pageNumber: number | null; chunkIndex: number; text: string }>; error?: string } };
}

async function main() {
  loadEnvConfig(process.cwd());
  const connectionString = process.env.DATABASE_URL;
  assert(connectionString, "DATABASE_URL is required for the RAG integration test.");

  let embeddingRequests = 0;
  let answerRequests = 0;
  let lastAnswerInput: unknown;
  let personaWasIncluded = false;
  const openAIServer = createServer((request, response) => {
    let rawBody = "";
    request.setEncoding("utf8");
    request.on("data", chunk => { rawBody += chunk; });
    request.on("end", () => {
      try {
        const body = JSON.parse(rawBody) as { input?: string | string[] | Array<{ role?: string; content?: string }>; instructions?: string };
        if (request.method === "POST" && request.url?.endsWith("/embeddings")) {
          const input = Array.isArray(body.input) ? body.input : [body.input];
          const data = input.map((value, index) => {
            if (typeof value !== "string") throw new Error("Invalid embedding input.");
            embeddingRequests++;
            return { object: "embedding", embedding: vector(queryVectorIndex(value)), index };
          });
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ object: "list", data, model: "text-embedding-3-small", usage: { prompt_tokens: data.length, total_tokens: data.length } }));
          return;
        }

        if (request.method === "POST" && request.url?.endsWith("/responses")) {
          answerRequests++;
          lastAnswerInput = body.input;
          const instructions = body.instructions ?? "";
          personaWasIncluded ||= instructions.includes("You are MILO") && instructions.includes("Axel");
          let answer = "The selected knowledge base does not contain enough information to answer that.";
          if (instructions.includes("MILO Bank's Aurora account has a withdrawal limit of 731 CHF per day.")) {
            answer = "MILO Bank's Aurora account limit is 731 CHF per day.";
          } else if (instructions.includes("Helios Power Plant uses turbine model PX-900.")) {
            answer = "Helios Power Plant uses the PX-900 turbine model.";
          } else if (instructions.includes("Nova Television broadcasts its science program at 21:35.")) {
            answer = "Nova Television's science program is broadcast at 21:35.";
          } else if (JSON.stringify(body.input).toLowerCase().includes("who are you")) {
            answer = "I’m MILO, a fictional runaway robot who escaped a hospital in China with Axel’s help.";
          }

          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(JSON.stringify({
            id: `resp_${answerRequests}`,
            object: "response",
            created_at: Math.floor(Date.now() / 1000),
            status: "completed",
            model: "gpt-4.1-mini",
            output: [{
              id: `msg_${answerRequests}`,
              type: "message",
              status: "completed",
              role: "assistant",
              content: [{ type: "output_text", text: answer, annotations: [] }],
            }],
          }));
          return;
        }

        response.writeHead(404).end();
      } catch {
        response.writeHead(400).end();
      }
    });
  });

  const openAIPort = await listen(openAIServer);
  const appPort = await reservePort();
  const baseURL = `http://127.0.0.1:${appPort}`;
  const prefix = `milo-rag-${randomUUID()}`;
  const fileNames = DOCUMENTS.map(document => `${prefix}-${document.file}`);
  const uploaded: Array<{ id: string; knowledgeBase: KnowledgeBase }> = [];
  const pool = new Pool({ connectionString });
  let appProcess: ChildProcess | undefined;

  try {
    const initialCounts = await pool.query<{ knowledge_base: KnowledgeBase; count: number }>(
      "SELECT knowledge_base, COUNT(*)::int AS count FROM public.documents GROUP BY knowledge_base",
    );
    const countByBase = new Map(initialCounts.rows.map(row => [row.knowledge_base, row.count]));
    const emptyKnowledgeBase = (["banks", "power", "media"] as const).find(base => !countByBase.get(base));

    appProcess = spawn(process.execPath, [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(appPort),
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        OPENAI_API_KEY: "local-rag-test-key",
        OPENAI_BASE_URL: `http://127.0.0.1:${openAIPort}/v1`,
        RAG_MIN_SIMILARITY: "0.99",
        RAG_TOP_K: "5",
      },
      stdio: "inherit",
    });
    await waitForApp(baseURL, appProcess);

    if (emptyKnowledgeBase) {
      const embeddingsBefore = embeddingRequests;
      const answersBefore = answerRequests;
      const empty = await postChat(baseURL, emptyKnowledgeBase, [{ role: "user", content: "What is in this knowledge base?" }]);
      assert(empty.status === 200 && empty.body.reply?.includes("No documents have been added"), "Empty knowledge base message was not returned.");
      assert(embeddingRequests === embeddingsBefore && answerRequests === answersBefore, "Empty knowledge base unnecessarily called an OpenAI endpoint.");
    }

    for (const document of DOCUMENTS) {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO public.documents (knowledge_base, file_name, file_type, file_size)
         VALUES ($1, $2, 'text/plain', $3)
         RETURNING id::text AS id`,
        [document.knowledgeBase, `${prefix}-${document.file}`, Buffer.byteLength(document.name)],
      );
      const id = result.rows[0]?.id;
      assert(id, `Could not seed ${document.knowledgeBase} fixture.`);
      const embedding = `[${vector(document.vectorIndex).join(",")}]`;
      await pool.query(
        `INSERT INTO public.document_chunks (document_id, knowledge_base, chunk_index, text, page_number, embedding)
         VALUES ($1, $2, 0, $3, $4, $5::vector)`,
        [id, document.knowledgeBase, document.name, document.pageNumber, embedding],
      );
      uploaded.push({ id, knowledgeBase: document.knowledgeBase });
    }

    const conversation = [
      { role: "user" as const, content: "I'm asking about the Aurora account." },
      { role: "assistant" as const, content: "I'll check the selected knowledge base." },
      { role: "user" as const, content: "What is the Aurora account withdrawal limit?" },
    ];
    const banks = await postChat(baseURL, "banks", conversation);
    assert(banks.status === 200 && banks.body.reply?.includes("731 CHF per day"), "A) Banks did not answer from the Aurora source.");
    assert(banks.body.sources?.some(source => source.documentName === fileNames[0] && source.text.includes("731 CHF")), "A) Banks answer did not return its source.");
    assert(Array.isArray(lastAnswerInput) && lastAnswerInput.length === 3, "Conversation context was not passed to the answer model.");

    const answersBeforePowerCrossQuery = answerRequests;
    const banksQuestionInPower = await postChat(baseURL, "power", [{ role: "user", content: "What is the Aurora account withdrawal limit?" }]);
    assert(banksQuestionInPower.status === 200 && banksQuestionInPower.body.reply?.includes("does not contain enough information"), "B) Power did not refuse the Banks-only fact.");
    assert(!banksQuestionInPower.body.sources?.length && answerRequests === answersBeforePowerCrossQuery, "B) Power received a cross-KB source or called the answer model.");

    const power = await postChat(baseURL, "power", [{ role: "user", content: "What turbine model does Helios Power Plant use?" }]);
    assert(power.status === 200 && power.body.reply?.includes("PX-900"), "C) Power did not answer with PX-900.");
    assert(power.body.sources?.some(source => source.documentName === fileNames[1] && source.pageNumber === 3), "C) Power answer did not return its page source.");

    const media = await postChat(baseURL, "media", [{ role: "user", content: "When is Nova Television's science program broadcast?" }]);
    assert(media.status === 200 && media.body.reply?.includes("21:35"), "D) Media did not answer with 21:35.");
    assert(media.body.sources?.some(source => source.documentName === fileNames[2]), "D) Media answer did not return its source.");

    const answersBeforeUnrelated = answerRequests;
    const unrelated = await postChat(baseURL, "banks", [{ role: "user", content: "Who won the 2024 world chess championship?" }]);
    assert(unrelated.status === 200 && unrelated.body.reply?.includes("does not contain enough information"), "E) An unrelated factual question was not refused.");
    assert(!unrelated.body.sources?.length && answerRequests === answersBeforeUnrelated, "E) An unrelated question called the answer model or returned a source.");

    const persona = await postChat(baseURL, "banks", [{ role: "user", content: "Who are you?" }]);
    assert(persona.status === 200 && persona.body.reply?.includes("MILO"), "MILO did not answer the identity question.");
    assert(!persona.body.sources?.length && personaWasIncluded, "MILO persona was not preserved for identity questions.");

    const invalid = await postChat(baseURL, "constructor" as KnowledgeBase, [{ role: "user", content: "What is the answer?" }]);
    assert(invalid.status === 400, "An invalid knowledge base was accepted.");
    assert(embeddingRequests >= 4 && answerRequests === 4, "Unexpected embedding or answer-model call counts.");

    console.log("RAG isolation passed: A Banks citation, B Power refusal, C Power citation, D Media citation, E unrelated-fact refusal.");
    console.log("Conversation history and MILO identity passed; empty-KB path " + (emptyKnowledgeBase ? "passed." : "not exercised because each KB already contains documents."));
  } finally {
    for (const document of uploaded) {
      await pool.query("DELETE FROM public.documents WHERE id = $1 AND knowledge_base = $2", [document.id, document.knowledgeBase]).catch(() => undefined);
    }
    await pool.query("DELETE FROM public.documents WHERE file_name = ANY($1::text[])", [fileNames]).catch(() => undefined);
    await pool.end();
    if (appProcess && appProcess.exitCode === null) {
      appProcess.kill();
      await new Promise(resolveExit => appProcess?.once("exit", resolveExit));
    }
    await closeServer(openAIServer);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "RAG integration test failed.");
  process.exitCode = 1;
});