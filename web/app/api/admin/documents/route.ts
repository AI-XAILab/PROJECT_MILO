import { DocumentInputError } from "../../../../lib/documents/errors";
import { isValidKnowledgeBase, ingestDocument, listDocuments, MAX_UPLOAD_BYTES } from "../../../../lib/documents/service";

export const runtime = "nodejs";

const MAX_MULTIPART_OVERHEAD = 64 * 1024;

async function readUploadFormData(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data;")) {
    throw new DocumentInputError("Send a valid multipart document upload.");
  }

  const reader = request.body?.getReader();
  if (!reader) throw new DocumentInputError("Send a valid multipart document upload.");

  const chunks: Uint8Array[] = [];
  let totalSize = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalSize += value.byteLength;
    if (totalSize > MAX_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD) {
      await reader.cancel();
      throw new DocumentInputError("Files must be 10 MB or smaller.", 413);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  }).formData();
}

export async function GET(request: Request) {
  const knowledgeBase = new URL(request.url).searchParams.get("knowledgeBase");
  if (!isValidKnowledgeBase(knowledgeBase)) {
    return Response.json({ error: "Choose a valid knowledge base." }, { status: 400 });
  }

  try {
    const documents = await listDocuments(knowledgeBase);
    return Response.json({ documents }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Documents could not be loaded. Please try again." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD) {
    return Response.json({ error: "Files must be 10 MB or smaller." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await readUploadFormData(request);
  } catch (error) {
    if (error instanceof DocumentInputError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "Send a valid multipart document upload." }, { status: 400 });
  }

  const knowledgeBase = formData.get("knowledgeBase");
  const file = formData.get("file");
  if (!isValidKnowledgeBase(knowledgeBase)) {
    return Response.json({ error: "Choose a valid knowledge base." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return Response.json({ error: "Choose a document to upload." }, { status: 400 });
  }
  if (!file.size) {
    return Response.json({ error: "The selected file is empty." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Files must be 10 MB or smaller." }, { status: 413 });
  }

  try {
    const result = await ingestDocument({
      fileName: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      knowledgeBase,
    });
    return Response.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DocumentInputError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "The document could not be processed. Please try again." }, { status: 500 });
  }
}