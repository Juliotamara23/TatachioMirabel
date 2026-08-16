import { test, expect } from "./fixtures/admin";

test.describe("Miembros", () => {
  test("renders miembros page with table or empty state", async ({ adminPage: page }) => {
    await page.goto("/miembros");

    // Either virtual table or empty state
    const hasTable = page.getByTestId("virtual-table");
    const hasEmpty = page.getByText(/sin datos|no hay/i);
    await expect(hasTable.or(hasEmpty)).toBeVisible();
  });
});
