import { expect, test } from "@playwright/test";

test("chat sends the active knowledge base and preserves expandable citations", async ({ page }) => {
  const requests: Array<{ knowledgeBase: string; messages: Array<{ role: string; content: string }> }> = [];
  await page.route("**/api/chat", async route => {
    const body = route.request().postDataJSON() as { knowledgeBase: string; messages: Array<{ role: string; content: string }> };
    requests.push(body);
    return route.fulfill({
      json: {
        reply: "Helios Power Plant uses the PX-900 turbine model.",
        sources: [{ documentName: "helios-operations.pdf", pageNumber: 3, chunkIndex: 0, text: "Helios Power Plant uses turbine model PX-900." }],
      },
    });
  });

  await page.goto("/");
  const selector = page.getByRole("combobox", { name: "Active knowledge base" });
  await expect(selector).toHaveText("Banks");
  await selector.click();
  await page.getByRole("option", { name: "Power Plants" }).click();
  await expect(selector).toHaveText("Power Plants");

  await page.getByRole("button", { name: /Meet the runaway/ }).click();
  await expect(page.locator(".message.assistant")).toContainText("PX-900");
  await expect(page.locator(".message-sources summary")).toHaveText("Sources (1)");
  await page.locator(".message-sources summary").click();
  await expect(page.locator(".message-sources")).toContainText("helios-operations.pdf");
  await expect(page.locator(".message-sources")).toContainText("Page 3");
  await expect(page.locator(".message-sources")).toContainText("turbine model PX-900");
  expect(requests[0]?.knowledgeBase).toBe("power");

  const composer = page.getByRole("textbox", { name: "Message MILO" });
  await composer.fill("And what does the source say?");
  await composer.press("Enter");
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]?.knowledgeBase).toBe("power");

  await page.reload();
  await expect(page.getByRole("combobox", { name: "Active knowledge base" })).toHaveText("Power Plants");
  await expect(page.locator(".message-sources summary")).toHaveCount(2);
});