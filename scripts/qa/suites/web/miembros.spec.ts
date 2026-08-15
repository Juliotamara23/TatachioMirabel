import { test, expect } from "./fixtures/admin";

test.describe("Miembros", () => {
  test("renders miembros page with table or empty state", async ({ adminPage: page }) => {
    await page.goto("/miembros");

    // Either virtual table or empty state
    const hasTable = await page.getByTestId("virtual-table").isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/sin datos|no hay/i).isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBeTruthy();
  });
});
