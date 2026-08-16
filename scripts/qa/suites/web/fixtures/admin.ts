import { test as base, type Page } from "@playwright/test";

/**
 * Programmatic login via POST /api/auth/login.
 * Stores token + user in localStorage for the frontend to pick up.
 * Also fetches and stores the first available cabildo ID.
 */
export async function loginAs(page: Page, email: string, password: string) {
  const apiUrl = process.env.VITE_API_BASE_URL ?? "http://localhost:3456";

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

  // Fetch cabildos and store the first one
  try {
    const cabildosResponse = await page.request.get(`${apiUrl}/api/cabildos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (cabildosResponse.ok()) {
      const cabildos = (await cabildosResponse.json()) as Array<{ id: string; nombre: string }>;
      if (cabildos.length > 0) {
        await page.evaluate((cabildoId) => {
          localStorage.setItem("tatachio:cabildoId", cabildoId);
        }, cabildos[0].id);
      }
    }
  } catch {
    // Silently fail — tests tolerate the placeholder when no cabildo is selected
  }
}

/**
 * Test fixture: automatically logs in as the admin user before each test.
 * The admin credentials match scripts/qa/fixtures/seed.json.
 */
export const test = base.extend<{ adminPage: Page }>({
  adminPage: async ({ page }, use) => {
    await loginAs(page, "admin@tatachio.com", "admin123");
    await use(page);
  },
});

export { expect } from "@playwright/test";
