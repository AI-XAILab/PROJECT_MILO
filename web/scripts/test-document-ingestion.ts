import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { KnowledgeBase } from "../lib/knowledge-bases";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function crc32(bytes: Buffer) {
  let checksum = 0xffffffff;
  for (const byte of bytes) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      checksum = (checksum >>> 1) ^ ((checksum & 1) ? 0xedb88320 : 0);
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function createDocx(text: string) {
  const entries = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    },
    {
      name: "word/document.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
    },
  ];
  const localEntries: Buffer[] = [];
  const centralEntries: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content = Buffer.from(entry.content, "utf8");
    const checksum = crc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localEntries.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralEntries.push(centralHeader, name);
    localOffset += localHeader.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralEntries);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localEntries, centralDirectory, end]);
}

async function createPdf(text: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 72, y: 720, size: 18, font });
  return Buffer.from(await pdf.save());
}

async function listen(server: Server) {
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert(address && typeof address !== "string", "Could not determine the local test server port.");
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

async function waitForApp(baseURL: string, process: ChildProcess) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error("The local Next.js test server stopped during startup.");
    try {
      const response = await fetch(`${baseURL}/api/admin/documents?knowledgeBase=banks`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      await new Promise(resolveWait => setTimeout(resolveWait, 250));
    }
  }
  throw new Error("The local Next.js test server did not become ready.");
}

async function readJson(response: Response) {
  return await response.json() as Record<string, unknown>;
}

async function main() {
  loadEnvConfig(process.cwd());
  const connectionString = process.env.DATABASE_URL;
  assert(connectionString, "DATABASE_URL is required for the local integration test.");

  let embeddingRequests = 0;
  const embeddingServer = createServer((request, response) => {
    let rawBody = "";
    request.setEncoding("utf8");
    request.on("data", chunk => { rawBody += chunk; });
    request.on("end", () => {
      try {
        const body = JSON.parse(rawBody) as { input?: string | string[]; model?: string };
        const inputs = Array.isArray(body.input) ? body.input : [body.input];
        if (request.method !== "POST" || !request.url?.endsWith("/embeddings") || inputs.some(value => typeof value !== "string")) {
          response.writeHead(400).end();
          return;
        }
        embeddingRequests++;
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({
          object: "list",
          data: inputs.map((_, index) => ({ object: "embedding", embedding: Array(1536).fill(0.001 + index / 1000), index })),
          model: body.model || "text-embedding-3-small",
          usage: { prompt_tokens: inputs.length, total_tokens: inputs.length },
        }));
      } catch {
        response.writeHead(400).end();
      }
    });
  });

  const embeddingPort = await listen(embeddingServer);
  const appPort = await reservePort();
  const baseURL = `http://127.0.0.1:${appPort}`;
  const prefix = `milo-ingestion-${randomUUID()}`;
  const testFiles = [
    { knowledgeBase: "banks" as const, suffix: "notes.txt", mimeType: "text/plain", bytes: Buffer.from("Bank policy integration test text.") },
    { knowledgeBase: "banks" as const, suffix: "brief.md", mimeType: "text/markdown", bytes: Buffer.from("# Bank brief\n\nMarkdown integration test.") },
    { knowledgeBase: "power" as const, suffix: "report.pdf", mimeType: "application/pdf", bytes: await createPdf("Power plant PDF integration test.") },
    {
      knowledgeBase: "media" as const,
      suffix: "script.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: createDocx("Media network DOCX integration test."),
    },
  ];
  const fileNames = testFiles.map(file => `${prefix}-${file.suffix}`);
  const uploaded: Array<{ id: string; knowledgeBase: KnowledgeBase }> = [];
  const pool = new Pool({ connectionString });
  let appProcess: ChildProcess | undefined;

  try {
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
        OPENAI_API_KEY: "local-integration-test-key",
        OPENAI_BASE_URL: `http://127.0.0.1:${embeddingPort}/v1`,
      },
      stdio: "inherit",
    });
    await waitForApp(baseURL, appProcess);

    for (const value of ["other", "toString", "constructor"]) {
      const invalidKnowledgeBase = new FormData();
      invalidKnowledgeBase.set("knowledgeBase", value);
      invalidKnowledgeBase.set("file", new Blob(["test"], { type: "text/plain" }), "invalid.txt");
      const invalidResponse = await fetch(`${baseURL}/api/admin/documents`, { method: "POST", body: invalidKnowledgeBase });
      assert(invalidResponse.status === 400, `Invalid knowledge base '${value}' was not rejected.`);
    }

    const unsupported = new FormData();
    unsupported.set("knowledgeBase", "media");
    unsupported.set("file", new Blob(["test"]), "unsupported.exe");
    const unsupportedResponse = await fetch(`${baseURL}/api/admin/documents`, { method: "POST", body: unsupported });
    assert(unsupportedResponse.status === 415, "Unsupported file type was not rejected.");

    const oversized = new FormData();
    oversized.set("knowledgeBase", "media");
    oversized.set("file", new Blob([Buffer.alloc(10 * 1024 * 1024 + 1)]), "oversized.txt");
    const oversizedResponse = await fetch(`${baseURL}/api/admin/documents`, { method: "POST", body: oversized });
    assert(oversizedResponse.status === 413, "Oversized files were not rejected.");

    for (const file of testFiles) {
      const formData = new FormData();
      formData.set("knowledgeBase", file.knowledgeBase);
      formData.set("file", new Blob([file.bytes], { type: file.mimeType }), `${prefix}-${file.suffix}`);
      const response = await fetch(`${baseURL}/api/admin/documents`, { method: "POST", body: formData });
      const body = await readJson(response);
      assert(response.status === 201, `Upload failed for ${file.suffix}: ${String(body.error ?? "unknown error")}`);
      const document = body.document as { id: string; knowledgeBase: KnowledgeBase };
      assert(document.knowledgeBase === file.knowledgeBase, `Knowledge base mismatch for ${file.suffix}.`);
      assert(Number(body.chunkCount) > 0, `No chunks were created for ${file.suffix}.`);
      uploaded.push({ id: document.id, knowledgeBase: file.knowledgeBase });
    }

    const ids = uploaded.map(document => document.id);
    const stored = await pool.query<{
      id: string;
      knowledge_base: KnowledgeBase;
      chunks: number;
      dimensions: number | null;
      base_matches: boolean | null;
      page_numbers: number[] | null;
    }>(
      `SELECT d.id::text AS id, d.knowledge_base,
         COUNT(c.id)::int AS chunks,
         MIN(vector_dims(c.embedding)) AS dimensions,
         bool_and(c.knowledge_base = d.knowledge_base) AS base_matches,
         array_agg(c.page_number) FILTER (WHERE c.page_number IS NOT NULL) AS page_numbers
       FROM public.documents d
       JOIN public.document_chunks c ON c.document_id = d.id
       WHERE d.id = ANY($1::bigint[])
       GROUP BY d.id, d.knowledge_base`,
      [ids],
    );
    assert(stored.rows.length === testFiles.length, "Not all document and chunk rows were stored.");
    for (const row of stored.rows) {
      assert(row.chunks > 0 && row.dimensions === 1536 && row.base_matches, "A chunk has invalid storage metadata or embedding dimensions.");
    }
    const pdfRow = stored.rows.find(row => row.knowledge_base === "power");
    assert(pdfRow?.page_numbers?.includes(1), "PDF page number was not preserved.");

    for (const knowledgeBase of ["banks", "power", "media"] as const) {
      const response = await fetch(`${baseURL}/api/admin/documents?knowledgeBase=${knowledgeBase}`);
      const body = await readJson(response) as { documents: Array<{ id: string; knowledgeBase: string }> };
      assert(response.ok, `Could not list ${knowledgeBase} documents.`);
      assert(body.documents.filter(document => ids.includes(document.id)).every(document => document.knowledgeBase === knowledgeBase), `The ${knowledgeBase} list returned a document from another knowledge base.`);
    }

    const first = uploaded[0];
    assert(first, "No documents were uploaded for deletion verification.");
    const wrongBase = first.knowledgeBase === "banks" ? "power" : "banks";
    const mismatchedDelete = await fetch(`${baseURL}/api/admin/documents/${first.id}?knowledgeBase=${wrongBase}`, { method: "DELETE" });
    assert(mismatchedDelete.status === 404, "A document could be deleted from the wrong knowledge base.");

    for (const document of uploaded) {
      const response = await fetch(`${baseURL}/api/admin/documents/${document.id}?knowledgeBase=${document.knowledgeBase}`, { method: "DELETE" });
      assert(response.ok, `Could not delete test document ${document.id}.`);
    }
    uploaded.length = 0;

    const remaining = await pool.query<{ documents: number; chunks: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM public.documents WHERE id = ANY($1::bigint[])) AS documents,
         (SELECT COUNT(*)::int FROM public.document_chunks WHERE document_id = ANY($1::bigint[])) AS chunks`,
      [ids],
    );
    assert(remaining.rows[0]?.documents === 0 && remaining.rows[0]?.chunks === 0, "Cascade deletion left document chunks behind.");
    assert(embeddingRequests === testFiles.length, "The embedding endpoint was not called once for each test document.");

    console.log(`Uploaded and embedded TXT, Markdown, PDF, and DOCX through the APIs using ${embeddingRequests} local mock request(s).`);
    console.log("Verified KB isolation, PDF page metadata, vector(1536) rows, listing, and cascade deletion.");
  } finally {
    if (uploaded.length) {
      for (const document of uploaded) {
        await fetch(`${baseURL}/api/admin/documents/${document.id}?knowledgeBase=${document.knowledgeBase}`, { method: "DELETE" }).catch(() => undefined);
      }
    }
    await pool.query("DELETE FROM public.documents WHERE file_name = ANY($1::text[])", [fileNames]).catch(() => undefined);
    await pool.end();
    if (appProcess && appProcess.exitCode === null) {
      appProcess.kill();
      await new Promise(resolveExit => appProcess?.once("exit", resolveExit));
    }
    await closeServer(embeddingServer);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Document integration test failed.");
  process.exitCode = 1;
});