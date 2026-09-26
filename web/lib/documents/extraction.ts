import "server-only";
import mammoth from "mammoth";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { DocumentInputError } from "./errors";
import type { ExtractedPage } from "./chunking";

export type DocumentFormat = "pdf" | "txt" | "md" | "docx";

export const DOCUMENT_MIME_TYPES: Record<DocumentFormat, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function getDocumentFormat(fileName: string): DocumentFormat {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "pdf" || extension === "txt" || extension === "md" || extension === "docx") {
    return extension;
  }
  throw new DocumentInputError("Choose a PDF, TXT, Markdown (.md), or DOCX file.", 415);
}

export async function extractTextPages(bytes: Buffer, format: DocumentFormat): Promise<ExtractedPage[]> {
  if (format === "txt" || format === "md") {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text.includes("\u0000")) throw new Error("Binary content");
      return [{ text, pageNumber: null }];
    } catch {
      throw new DocumentInputError("This file is not valid UTF-8 text.");
    }
  }

  if (format === "pdf") return extractPdfPages(bytes);
  return extractDocxText(bytes);
}

async function extractPdfPages(bytes: Buffer): Promise<ExtractedPage[]> {
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new DocumentInputError("This file does not contain a valid PDF document.");
  }

  let pdf: PDFDocumentProxy | undefined;
  try {
    const loadingTask = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true });
    pdf = await loadingTask.promise;
    if (pdf.numPages > 2000) {
      throw new DocumentInputError("PDFs may contain no more than 2,000 pages.", 413);
    }

    const pages: ExtractedPage[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map(item => ("str" in item ? item.str : "")).join(" ");
      pages.push({ text, pageNumber });
      page.cleanup();
    }
    return pages;
  } catch (error) {
    if (error instanceof DocumentInputError) throw error;
    throw new DocumentInputError("This PDF could not be read. Check that it is not damaged or password-protected.");
  } finally {
    await pdf?.destroy();
  }
}

async function extractDocxText(bytes: Buffer): Promise<ExtractedPage[]> {
  if (bytes.subarray(0, 2).toString("ascii") !== "PK") {
    throw new DocumentInputError("This file does not contain a valid DOCX document.");
  }

  try {
    const result = await mammoth.extractRawText({ buffer: bytes });
    return [{ text: result.value, pageNumber: null }];
  } catch {
    throw new DocumentInputError("This DOCX file could not be read. Check that it is not damaged.");
  }
}