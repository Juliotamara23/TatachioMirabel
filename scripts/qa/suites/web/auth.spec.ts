import { test, expect } from "./fixtures/admin";

test.describe("Authentication", () => {
  test("login with valid credentials redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("login-email").fill("admin@tatachio.org");
    await page.getByTestId("login-password").fill("admin123");
    await page.getByTestId("login-submit").click();

    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByText("Dashboard")).toBeVisible();
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("login-email").fill("bad@test.com");
    await page.getByTestId("login-password").fill("wrong");
    await page.getByTestId("login-submit").click();

    await expect(page.getByText(/contraseña|invalid|credenciales/i)).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("unauthenticated navigation redirects to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/login");
  });
});
