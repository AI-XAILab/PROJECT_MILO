import "server-only";
import { pool } from "./db";
import { createEmbeddings } from "./documents/embeddings";
import { isKnowledgeBase, type KnowledgeBase } from "./knowledge-bases";

export type RetrievedChunk = {
  documentId: string;
  documentName: string;
  knowledgeBase: KnowledgeBase;
  chunkIndex: number;
  pageNumber: number | null;
  similarity: number;
  text: string;
};

export type RetrievalResult =
  | { status: "empty"; sources: [] }
  | { status: "insufficient"; sources: [] }
  | { status: "retrieved"; sources: RetrievedChunk[] };

const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SIMILARITY = 0.35;

function getTopK() {
  const value = Number(process.env.RAG_TOP_K);
  return Number.isInteger(value) && value >= 1 && value <= 20 ? value : DEFAULT_TOP_K;
}

export function getMinimumSimilarity() {
  const value = Number(process.env.RAG_MIN_SIMILARITY);
  return Number.isFinite(value) && value >= -1 && value <= 1 ? value : DEFAULT_MIN_SIMILARITY;
}

export async function retrieveChunks(query: string, knowledgeBase: KnowledgeBase): Promise<RetrievalResult> {
  if (!isKnowledgeBase(knowledgeBase)) throw new Error("Invalid knowledge base.");

  const documentCheck = await pool.query<{ has_documents: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM public.documents WHERE knowledge_base = $1) AS has_documents",
    [knowledgeBase],
  );
  if (!documentCheck.rows[0]?.has_documents) return { status: "empty", sources: [] };

  const [queryEmbedding] = await createEmbeddings([query]);
  if (!queryEmbedding || queryEmbedding.length !== 1536) throw new Error("Query embedding was unavailable.");

  const vector = `[${queryEmbedding.join(",")}]`;
  const result = await pool.query<RetrievedChunk>(
    `SELECT
       c.document_id::text AS "documentId",
       d.file_name AS "documentName",
       c.knowledge_base AS "knowledgeBase",
       c.chunk_index AS "chunkIndex",
       c.page_number AS "pageNumber",
       (1 - (c.embedding <=> $1::vector))::float8 AS similarity,
       c.text
     FROM public.document_chunks AS c
     JOIN public.documents AS d
       ON d.id = c.document_id
       AND d.knowledge_base = c.knowledge_base
     WHERE c.knowledge_base = $2
       AND d.knowledge_base = $2
     ORDER BY c.embedding <=> $1::vector
     LIMIT $3`,
    [vector, knowledgeBase, getTopK()],
  );

  const sources = result.rows.filter(chunk => chunk.similarity >= getMinimumSimilarity());
  return sources.length ? { status: "retrieved", sources } : { status: "insufficient", sources: [] };
}