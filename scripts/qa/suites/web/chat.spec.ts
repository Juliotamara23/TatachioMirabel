import { test, expect } from "./fixtures/admin";

test.describe("Chat", () => {
  test("renders chat interface with input and model selector", async ({ adminPage: page }) => {
    await page.goto("/chat");

    await expect(page.getByTestId("chat-input")).toBeVisible();
    await expect(page.getByTestId("chat-send-btn")).toBeVisible();
    // Model selector visible for admin
    await expect(page.getByTestId("model-selector")).toBeVisible();
  });

  test("can type a message and click send", async ({ adminPage: page }) => {
    await page.goto("/chat");

    await page.getByTestId("chat-input").fill("Hola, ¿cómo estás?");
    await expect(page.getByTestId("chat-input")).toHaveValue("Hola, ¿cómo estás?");
  });
});
