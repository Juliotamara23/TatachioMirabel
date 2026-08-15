import { test as base, type Page } from "@playwright/test";

/**
 * Programmatic login via POST /api/auth/login.
 * Stores token + user in localStorage for the frontend to pick up.
 */
export async function loginAs(page: Page, email: string, password: string) {
  const apiUrl = process.env.VITE_API_BASE_URL ?? "http://localhost:3000";

  const response = await page.request.post(`${apiUrl}/api/auth/login`, {
    data: { email, password },
  });

  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()} ${response.statusText()}`);
  }

  const { token, user } = (await response.json()) as { token: string; user: { id: string; email: string; nombre: string; rol: string } };

  // Store in localStorage so the frontend restores auth on navigation
  await page.goto("/");
  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem("tatachio:auth", JSON.stringify({ token, user }));
    },
    { token, user },
  );
}

/**
 * Test fixture: automatically logs in as the admin user before each test.
 * The admin credentials match scripts/qa/fixtures/seed.json.
 */
export const test = base.extend<{ adminPage: Page }>({
  adminPage: async ({ page }, use) => {
    await loginAs(page, "admin@tatachio.org", "admin123");
    await use(page);
  },
});

export { expect } from "@playwright/test";
