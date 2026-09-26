BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  CREATE TYPE public.knowledge_base AS ENUM ('banks', 'power', 'media');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  knowledge_base public.knowledge_base NOT NULL,
  file_name TEXT NOT NULL CHECK (length(btrim(file_name)) > 0),
  file_type TEXT NOT NULL CHECK (length(btrim(file_type)) > 0),
  file_size BIGINT NOT NULL CHECK (file_size >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, knowledge_base)
);

CREATE TABLE IF NOT EXISTS public.document_chunks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id BIGINT NOT NULL,
  knowledge_base public.knowledge_base NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  text TEXT NOT NULL CHECK (length(btrim(text)) > 0),
  page_number INTEGER CHECK (page_number IS NULL OR page_number > 0),
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_chunks_document_knowledge_base_fk
    FOREIGN KEY (document_id, knowledge_base)
    REFERENCES public.documents (id, knowledge_base)
    ON DELETE CASCADE,
  CONSTRAINT document_chunks_document_chunk_index_key
    UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS documents_knowledge_base_created_at_idx
  ON public.documents (knowledge_base, created_at DESC);

CREATE INDEX IF NOT EXISTS document_chunks_knowledge_base_document_idx
  ON public.document_chunks (knowledge_base, document_id, chunk_index);

CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw_idx
  ON public.document_chunks USING hnsw (embedding vector_cosine_ops);

COMMIT;