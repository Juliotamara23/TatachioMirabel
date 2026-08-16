import { test, expect } from "./fixtures/admin";

test.describe("App Shell", () => {
  test("sidebar navigation routes to correct pages", async ({ adminPage: page }) => {
    await page.goto("/dashboard");

    // Verify sidebar items exist (use role=link to avoid strict mode violations from body text)
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Miembros" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Familias" })).toBeVisible();

    // Navigate via sidebar
    await page.getByRole("link", { name: "Miembros" }).click();
    await expect(page).toHaveURL("/miembros");

    await page.getByRole("link", { name: "Familias" }).click();
    await expect(page).toHaveURL("/familias");

    await page.getByRole("link", { name: "Chat" }).click();
    await expect(page).toHaveURL("/chat");
  });

  test("topbar has cabildo selector and theme toggle", async ({ adminPage: page }) => {
    await page.goto("/dashboard");

    await expect(page.getByTestId("cabildo-selector")).toBeVisible();
    await expect(page.getByTestId("theme-toggle")).toBeVisible();
  });
});
