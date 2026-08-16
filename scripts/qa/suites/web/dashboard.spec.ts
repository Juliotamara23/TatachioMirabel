import { test, expect } from "./fixtures/admin";

test.describe("Dashboard", () => {
  test("shows KPI cards with counts or placeholder when no cabildo selected", async ({ adminPage: page }) => {
    await page.goto("/dashboard");

    // Either KPI cards (when cabildo selected) or placeholder (when no cabildo)
    const kpiCards = page.getByTestId("kpi-card");
    const placeholder = page.getByText("Selecciona un cabildo para ver el dashboard");
    await expect(kpiCards.first().or(placeholder)).toBeVisible();
  });
});
