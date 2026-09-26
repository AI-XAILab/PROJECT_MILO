import { DocumentInputError } from "../../../../../lib/documents/errors";
import { deleteDocument, isValidKnowledgeBase } from "../../../../../lib/documents/service";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const knowledgeBase = new URL(request.url).searchParams.get("knowledgeBase");
  if (!isValidKnowledgeBase(knowledgeBase)) {
    return Response.json({ error: "Choose a valid knowledge base." }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const deleted = await deleteDocument(id, knowledgeBase);
    if (!deleted) return Response.json({ error: "Document not found." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    if (error instanceof DocumentInputError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "The document could not be deleted. Please try again." }, { status: 500 });
  }
}