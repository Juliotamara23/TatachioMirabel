import { test, expect } from "./fixtures/admin";

test.describe("App Shell", () => {
  test("sidebar navigation routes to correct pages", async ({ adminPage: page }) => {
    await page.goto("/dashboard");

    // Verify sidebar items exist
    await expect(page.getByText("Dashboard")).toBeVisible();
    await expect(page.getByText("Miembros")).toBeVisible();
    await expect(page.getByText("Familias")).toBeVisible();

    // Navigate via sidebar
    await page.getByText("Miembros").click();
    await expect(page).toHaveURL("/miembros");

    await page.getByText("Familias").click();
    await expect(page).toHaveURL("/familias");

    await page.getByText("Chat").click();
    await expect(page).toHaveURL("/chat");
  });

  test("topbar has cabildo selector and theme toggle", async ({ adminPage: page }) => {
    await page.goto("/dashboard");

    await expect(page.getByTestId("cabildo-selector")).toBeVisible();
    await expect(page.getByTestId("theme-toggle")).toBeVisible();
  });
});
