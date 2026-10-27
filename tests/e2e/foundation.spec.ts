import { expect, authenticatedTest as test } from "./fixtures";

test("the foundation renders, navigates, and fits the viewport", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your business story starts here" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Explore Basira" }).click();
  await expect(
    page.getByRole("heading", { name: "A little clarity goes a long way." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Intelligent Decision Support System with Predictive Analytics for Small Businesses",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to overview" }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("light and dark themes persist across reloads", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
});

test("compact navigation traps focus, closes with Escape, and navigates", async ({
  page,
}) => {
  test.skip(
    (page.viewportSize()?.width ?? 1440) >= 1024,
    "Compact-layout drawer behavior.",
  );
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Navigation", exact: true });
  await expect(drawer).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(
      await drawer.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await drawer.getByRole("link", { name: "About Basira" }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page).toHaveURL(/\/about$/);
});

test("unknown routes return a useful 404 and liveness stays minimal", async ({
  page,
  request,
}) => {
  const response = await page.goto("/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "This page isn’t here." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Return to overview" }).click();
  await expect(page).toHaveURL(/\/$/);
  const health = await request.get("/api/health");
  expect(await health.json()).toEqual({ status: "ok" });
  expect(health.headers()["cache-control"]).toBe("no-store");
  expect(health.headers()["x-content-type-options"]).toBe("nosniff");
  expect(health.headers()["x-frame-options"]).toBe("DENY");
});
