import { expect, test } from "@playwright/test";
import { CHUNK_OVERLAP_CHARS, CHUNK_SIZE_CHARS, chunkPages } from "../lib/documents/chunking";

test("chunking keeps bounded overlapping text and document metadata", () => {
  const metadata = { knowledgeBase: "power" as const, fileName: "plant.txt", fileType: "text/plain", fileSize: 4096 };
  const chunks = chunkPages([{ text: "alpha beta gamma delta ".repeat(200), pageNumber: 7 }], metadata);

  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.every(chunk => chunk.text.length > 0 && chunk.text.length <= CHUNK_SIZE_CHARS)).toBeTruthy();
  expect(chunks[0]?.text.slice(-CHUNK_OVERLAP_CHARS)).toBe(chunks[1]?.text.slice(0, CHUNK_OVERLAP_CHARS));
  expect(chunks.every(chunk => chunk.knowledgeBase === metadata.knowledgeBase && chunk.fileName === metadata.fileName)).toBeTruthy();
  expect(chunks.every(chunk => chunk.pageNumber === 7)).toBeTruthy();
  expect(chunkPages([{ text: "  \n  ", pageNumber: null }], metadata)).toEqual([]);
});

test("Admin uploads and deletes documents in the selected knowledge base", async ({ page }) => {
  const documents: Record<string, Array<{ id: string; knowledgeBase: string; fileName: string; fileType: string; fileSize: number; createdAt: string }>> = {
    banks: [],
    power: [],
    media: [],
  };
  let nextId = 1;

  await page.route("**/api/admin/documents**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const knowledgeBase = url.searchParams.get("knowledgeBase") ?? "";

    if (request.method() === "GET") {
      return route.fulfill({ json: { documents: documents[knowledgeBase] ?? [] } });
    }

    if (request.method() === "POST") {
      const body = request.postDataBuffer()?.toString("latin1") ?? "";
      const base = body.match(/name="knowledgeBase"\r\n\r\n([^\r\n]+)/u)?.[1] ?? "";
      const fileName = body.match(/filename="([^"]+)"/u)?.[1] ?? "";
      if (!documents[base] || !fileName) {
        return route.fulfill({ status: 400, json: { error: "Invalid test upload." } });
      }

      const document = {
        id: String(nextId++),
        knowledgeBase: base,
        fileName,
        fileType: "text/plain",
        fileSize: 32,
        createdAt: new Date().toISOString(),
      };
      documents[base].push(document);
      return route.fulfill({ status: 201, json: { document, chunkCount: 1 } });
    }

    if (request.method() === "DELETE") {
      const id = url.pathname.split("/").pop();
      documents[knowledgeBase] = (documents[knowledgeBase] ?? []).filter(document => document.id !== id);
      return route.fulfill({ json: { deleted: true } });
    }

    return route.continue();
  });

  await page.goto("/admin");
  await expect(page.locator(".admin-status-pill")).toHaveText("Connected");

  const banksCard = page.locator('[data-knowledge-base="banks"]');
  await banksCard.getByLabel("Select document for Banks").setInputFiles({
    name: "bank-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Bank policy upload test.", "utf8"),
  });
  await expect(banksCard.locator(".document-list-placeholder")).toContainText("bank-notes.txt");
  await expect(banksCard.locator(".knowledge-card-meta")).toContainText("1");

  const powerCard = page.locator('[data-knowledge-base="power"]');
  await powerCard.getByLabel("Select document for Power Plants").setInputFiles({
    name: "plant-notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Plant operations\nTest upload.", "utf8"),
  });
  await expect(powerCard.locator(".document-list-placeholder")).toContainText("plant-notes.md");
  await expect(banksCard.locator(".document-list-placeholder")).not.toContainText("plant-notes.md");

  page.on("dialog", dialog => dialog.accept());
  await banksCard.getByRole("button", { name: "Delete bank-notes.txt" }).click();
  await expect(banksCard.locator(".document-list-placeholder")).toContainText("No documents yet.");
  await expect(powerCard.locator(".document-list-placeholder")).toContainText("plant-notes.md");
});