import "server-only";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { isKnowledgeBase, type KnowledgeBase } from "../knowledge-bases";
import { chunkPages, type DocumentChunk } from "./chunking";
import { createEmbeddings } from "./embeddings";
import { DocumentInputError } from "./errors";
import { DOCUMENT_MIME_TYPES, extractTextPages, getDocumentFormat } from "./extraction";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type DocumentRecord = {
  id: string;
  knowledgeBase: KnowledgeBase;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
};

type RawDocumentRecord = Omit<DocumentRecord, "fileSize" | "createdAt"> & {
  fileSize: string;
  createdAt: Date;
};

export function sanitizeFileName(fileName: string): string {
  const baseName = fileName.replace(/\\/gu, "/").split("/").pop() ?? "";
  const safeName = baseName.replace(/[<>:"|?*\u0000-\u001f\u007f]/gu, "_").trim();

  if (!safeName || safeName === "." || safeName === ".." || Array.from(safeName).length > 255) {
    throw new DocumentInputError("The filename is invalid or too long.");
  }
  return safeName;
}

function serializeDocument(row: RawDocumentRecord): DocumentRecord {
  return {
    ...row,
    fileSize: Number(row.fileSize),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function ingestDocument(input: {
  fileName: string;
  bytes: Buffer;
  knowledgeBase: KnowledgeBase;
}): Promise<{ document: DocumentRecord; chunkCount: number }> {
  const fileName = sanitizeFileName(input.fileName);
  const format = getDocumentFormat(fileName);
  const fileType = DOCUMENT_MIME_TYPES[format];
  const fileSize = input.bytes.byteLength;

  if (!fileSize) throw new DocumentInputError("The selected file is empty.");
  if (fileSize > MAX_UPLOAD_BYTES) {
    throw new DocumentInputError("Files must be 10 MB or smaller.", 413);
  }

  const pages = await extractTextPages(input.bytes, format);
  const chunks = chunkPages(pages, { knowledgeBase: input.knowledgeBase, fileName, fileType, fileSize });
  if (!chunks.length) {
    throw new DocumentInputError("No readable text was found in this document.");
  }

  let embeddings: number[][];
  try {
    embeddings = await createEmbeddings(chunks.map(chunk => chunk.text));
  } catch {
    throw new DocumentInputError("Could not create document embeddings. Check the server's OpenAI configuration and try again.", 502);
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const result = await client.query<RawDocumentRecord>(
      `INSERT INTO public.documents (knowledge_base, file_name, file_type, file_size)
       VALUES ($1, $2, $3, $4)
       RETURNING id::text AS id, knowledge_base AS "knowledgeBase", file_name AS "fileName",
         file_type AS "fileType", file_size::text AS "fileSize", created_at AS "createdAt"`,
      [input.knowledgeBase, fileName, fileType, fileSize],
    );
    const insertedDocument = result.rows[0];
    if (!insertedDocument) throw new Error("Document insert returned no row.");

    await insertChunks(client, insertedDocument.id, input.knowledgeBase, chunks, embeddings);
    await client.query("COMMIT");
    transactionStarted = false;

    return { document: serializeDocument(insertedDocument), chunkCount: chunks.length };
  } catch {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => undefined);
    throw new DocumentInputError("The document could not be saved. No partial document was kept.", 500);
  } finally {
    client.release();
  }
}

async function insertChunks(
  client: PoolClient,
  documentId: string,
  knowledgeBase: KnowledgeBase,
  chunks: DocumentChunk[],
  embeddings: number[][],
) {
  const rowsPerInsert = 100;

  for (let start = 0; start < chunks.length; start += rowsPerInsert) {
    const batch = chunks.slice(start, start + rowsPerInsert);
    const parameters: (string | number | null)[] = [];
    const values = batch.map((chunk, batchIndex) => {
      const embedding = embeddings[start + batchIndex];
      if (!embedding) throw new Error("Missing chunk embedding.");

      const parameterIndex = parameters.length + 1;
      parameters.push(
        documentId,
        knowledgeBase,
        chunk.chunkIndex,
        chunk.text,
        chunk.pageNumber,
        `[${embedding.join(",")}]`,
      );
      return `($${parameterIndex}::bigint, $${parameterIndex + 1}::public.knowledge_base,
        $${parameterIndex + 2}::integer, $${parameterIndex + 3}::text,
        $${parameterIndex + 4}::integer, $${parameterIndex + 5}::vector)`;
    });

    await client.query(
      `INSERT INTO public.document_chunks
        (document_id, knowledge_base, chunk_index, text, page_number, embedding)
       VALUES ${values.join(",")}`,
      parameters,
    );
  }
}

export async function listDocuments(knowledgeBase: KnowledgeBase): Promise<DocumentRecord[]> {
  const result = await pool.query<RawDocumentRecord>(
    `SELECT id::text AS id, knowledge_base AS "knowledgeBase", file_name AS "fileName",
       file_type AS "fileType", file_size::text AS "fileSize", created_at AS "createdAt"
     FROM public.documents
     WHERE knowledge_base = $1
     ORDER BY created_at DESC, id DESC`,
    [knowledgeBase],
  );
  return result.rows.map(serializeDocument);
}

export async function deleteDocument(id: string, knowledgeBase: KnowledgeBase): Promise<boolean> {
  if (!/^\d{1,19}$/u.test(id) || (id.length === 19 && id > "9223372036854775807")) return false;
  const result = await pool.query(
    "DELETE FROM public.documents WHERE id = $1 AND knowledge_base = $2",
    [id, knowledgeBase],
  );
  return result.rowCount === 1;
}

export function isValidKnowledgeBase(value: unknown): value is KnowledgeBase {
  return isKnowledgeBase(value);
}