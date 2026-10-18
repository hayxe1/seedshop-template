import { type Page } from "@playwright/test";

export async function loginAsAdmin(page: Page) {
  const response = await page.request.post("/api/admin/login", {
    data: {
      email: "admin@seed-store.local",
      password: "change-me",
    },
  });

  if (!response.ok()) {
    throw new Error(`Admin login failed with status ${response.status()}`);
  }

  await page.goto("/admin");
}
