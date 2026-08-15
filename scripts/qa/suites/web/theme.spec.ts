import { test, expect } from "./fixtures/admin";

test.describe("Theme", () => {
  test("dark mode toggle persists on reload", async ({ adminPage: page }) => {
    await page.goto("/dashboard");

    // Toggle to dark
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Reload and verify persistence
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Toggle back
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});
