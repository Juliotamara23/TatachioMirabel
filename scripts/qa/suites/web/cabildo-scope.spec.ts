import { test, expect } from "./fixtures/admin";

test.describe("Cabildo Scope", () => {
  test("switching cabildo updates selector value", async ({ adminPage: page }) => {
    await page.goto("/dashboard");

    const selector = page.getByTestId("cabildo-selector");
    const initialValue = await selector.inputValue();

    // Get all option values (not labels)
    const optionValues = await selector.locator("option").evaluateAll((opts) =>
      opts.map((o) => o.value)
    );

    // If there are multiple cabildos, switch to a different one by value
    if (optionValues.length > 1) {
      const otherValue = optionValues.find((v) => v !== initialValue);
      if (otherValue) {
        await selector.selectOption({ value: otherValue });
        // The value should have changed
        const newValue = await selector.inputValue();
        expect(newValue).toBe(otherValue);
      }
    }
  });
});
