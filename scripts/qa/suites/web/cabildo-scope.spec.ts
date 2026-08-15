import { test, expect } from "./fixtures/admin";

test.describe("Cabildo Scope", () => {
  test("switching cabildo updates selector value", async ({ adminPage: page }) => {
    await page.goto("/dashboard");

    const selector = page.getByTestId("cabildo-selector");
    const initialValue = await selector.inputValue();

    // If there are multiple cabildos, switch to a different one
    const options = await selector.locator("option").allTextContents();
    if (options.length > 1) {
      const otherOption = options.find((o) => o.trim() !== initialValue);
      if (otherOption) {
        await selector.selectOption({ label: otherOption });
        // The value should have changed
        const newValue = await selector.inputValue();
        expect(newValue).not.toBe(initialValue);
      }
    }
  });
});
