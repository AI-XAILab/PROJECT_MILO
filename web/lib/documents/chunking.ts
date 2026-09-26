import type { KnowledgeBase } from "../knowledge-bases";

export const CHUNK_SIZE_CHARS = 1200;
export const CHUNK_OVERLAP_CHARS = 200;

export type ExtractedPage = {
  text: string;
  pageNumber: number | null;
};

export type ChunkMetadata = {
  knowledgeBase: KnowledgeBase;
  fileName: string;
  fileType: string;
  fileSize: number;
};

export type DocumentChunk = ChunkMetadata & {
  chunkIndex: number;
  text: string;
  pageNumber: number | null;
};

export function chunkPages(pages: ExtractedPage[], metadata: ChunkMetadata): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];

  for (const page of pages) {
    const text = page.text.replace(/\s+/gu, " ").trim();
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + CHUNK_SIZE_CHARS, text.length);
      if (end < text.length) {
        const boundary = text.lastIndexOf(" ", end);
        if (boundary > start + CHUNK_SIZE_CHARS / 2) end = boundary;
      }

      const chunkText = text.slice(start, end).trim();
      if (chunkText) {
        chunks.push({
          ...metadata,
          chunkIndex: chunks.length,
          text: chunkText,
          pageNumber: page.pageNumber,
        });
      }

      if (end >= text.length) break;
      start = Math.max(start + 1, end - CHUNK_OVERLAP_CHARS);
    }
  }

  return chunks;
}