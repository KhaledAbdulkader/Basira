import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { authenticatedTest as test, expect } from "./fixtures";
import { testDatabase as db } from "../helpers/database";
import { lockFinancialSettings } from "../../src/lib/business/service";

const origin = "http://127.0.0.1:3100";
const input = {
  name: "A quiet cafe",
  businessType: "CAFE",
  currency: "SAR",
  timezone: "Asia/Riyadh",
  location: "Riyadh",
};

async function openSwitcher(page: Page) {
  if ((page.viewportSize()?.width ?? 1440) < 1024)
    await page.getByRole("button", { name: "Open navigation" }).click();
  return page
    .getByRole("combobox", { name: "Active business" })
    .filter({ visible: true });
}

test("create two businesses, switch persistently, edit settings, and confirm deletion", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Create your first business" }).click();
  const browserZone = await page.evaluate(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  await expect(page.getByLabel("Timezone", { exact: true })).toHaveValue(
    browserZone,
  );
  await page.getByLabel("Business name", { exact: true }).fill("Olive Cafe");
  await page.getByLabel("Business type", { exact: true }).selectOption("CAFE");
  await page.getByLabel("Currency", { exact: true }).selectOption("SAR");
  await page
    .getByLabel("Timezone", { exact: true })
    .selectOption("Asia/Riyadh");
  await page
    .getByRole("button", { name: "Create business", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Olive Cafe", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View all businesses" }).click();
  await page.getByRole("link", { name: "Add business" }).click();
  await page.getByLabel("Business name", { exact: true }).fill("Studio Two");
  await page.getByLabel("Business type", { exact: true }).selectOption("OTHER");
  await page.getByLabel("Describe your business type").fill("Design studio");
  await page.getByLabel("Location", { exact: false }).fill("New York");
  await page.getByLabel("Currency", { exact: true }).selectOption("USD");
  await page
    .getByLabel("Timezone", { exact: true })
    .selectOption("America/New_York");
  await page
    .getByRole("button", { name: "Create business", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Studio Two", exact: true }),
  ).toBeVisible();
  const businesses = (
    await (await page.request.get("/api/v1/businesses")).json()
  ).businesses as { id: string; name: string }[];
  const first = businesses.find((business) => business.name === "Olive Cafe")!;
  await (await openSwitcher(page)).selectOption(first.id);
  await expect(
    page.getByRole("heading", { name: "Olive Cafe", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Olive Cafe", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Business settings", exact: true })
    .click();
  await page.getByLabel("Business name", { exact: true }).fill("Olive & Oak");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Business changes saved.");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Delete business", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Delete this business?" });
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 5; index++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await expect(
    dialog.getByRole("button", { name: "Permanently delete" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete business", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Delete business", exact: true })
    .click();
  await dialog
    .getByLabel("Type the business name to confirm")
    .fill("Olive & Oak");
  await dialog.getByRole("button", { name: "Permanently delete" }).click();
  await expect(
    page.getByRole("heading", { name: "Your businesses" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Olive & Oak", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Studio Two", exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Studio Two", exact: true }),
  ).toBeVisible();
});

test("foreign IDs and forged selected-business cookies never expose another owner's profile", async ({
  page,
  account,
}) => {
  const outsider = await db.user.create({
    data: { email: `${randomUUID()}@browser-test.example` },
  });
  const foreign = await db.business.create({
    data: {
      ownerId: outsider.id,
      ...input,
      businessType: "CAFE",
      name: "Private foreign business",
    },
  });
  try {
    await db.user.update({
      where: { id: account.id },
      data: { role: "ADMIN" },
    });
    const response = await page.request.post("/api/v1/businesses", {
      headers: { origin },
      data: input,
    });
    expect(response.status()).toBe(201);
    const own = (await response.json()).business;
    const listing = await page.request.get("/api/v1/businesses");
    expect(
      (await listing.json()).businesses.map(
        (business: { id: string }) => business.id,
      ),
    ).toEqual([own.id]);
    expect(listing.headers()["cache-control"]).toBe("no-store");
    expect(
      (await page.request.get(`/api/v1/businesses/${foreign.id}`)).status(),
    ).toBe(404);
    expect(
      (
        await page.request.put(`/api/v1/businesses/${foreign.id}`, {
          headers: { origin },
          data: { ...input, version: 1 },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.delete(`/api/v1/businesses/${foreign.id}`, {
          headers: { origin },
          data: { confirmationName: foreign.name, version: 1 },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.post("/api/v1/businesses/selection", {
          headers: { origin },
          data: { businessId: foreign.id },
        })
      ).status(),
    ).toBe(404);
    await page
      .context()
      .addCookies([
        { name: "basira-business", value: foreign.id, url: origin },
      ]);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: input.name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(foreign.name, { exact: true }),
    ).not.toBeVisible();
    await page.goto(`/businesses/${foreign.id}`);
    // Next.js can already have sent 200 for its loading shell before notFound().
    // API status is asserted above; assert the denied UI and no leaked payload here.
    await expect(
      page.getByRole("heading", { name: "This page isn’t here." }),
    ).toBeVisible();
    expect(await page.content()).not.toContain(foreign.name);
    await expect(
      page.getByText(foreign.name, { exact: true }),
    ).not.toBeVisible();
  } finally {
    await db.business.delete({ where: { id: foreign.id } });
    await db.user.delete({ where: { id: outsider.id } });
  }
});

test("business mutations require origin, reject injected ownership, and block suspended sessions", async ({
  page,
  account,
  request,
}) => {
  expect((await request.get("/api/v1/businesses")).status()).toBe(401);
  expect(
    (await page.request.post("/api/v1/businesses", { data: input })).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/v1/businesses", {
        headers: { origin: "https://attacker.example" },
        data: input,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/v1/businesses", {
        headers: { origin },
        data: { ...input, ownerId: account.id },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/v1/businesses", {
        headers: { origin },
        data: { ...input, financialSettingsLockedAt: null },
      })
    ).status(),
  ).toBe(400);
  await db.user.update({
    where: { id: account.id },
    data: { status: "SUSPENDED" },
  });
  expect((await page.request.get("/api/v1/businesses")).status()).toBe(401);
  expect(
    (
      await page.request.post("/api/v1/businesses", {
        headers: { origin },
        data: input,
      })
    ).status(),
  ).toBe(401);
});

test("locked currency/timezone stay immutable in UI and API; stale settings show a useful conflict", async ({
  page,
  account,
}) => {
  const response = await page.request.post("/api/v1/businesses", {
    headers: { origin },
    data: input,
  });
  const business = (await response.json()).business;
  await page.goto(`/businesses/${business.id}`);
  await page.request.put(`/api/v1/businesses/${business.id}`, {
    headers: { origin },
    data: {
      ...input,
      name: "Another window's change",
      version: business.version,
    },
  });
  await page.getByLabel("Business name", { exact: true }).fill("Stale name");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed in another window" }),
  ).toBeVisible();
  const locked = await db.$transaction((tx) =>
    lockFinancialSettings(tx, account.id, business.id),
  );
  await page.reload();
  await expect(page.getByLabel("Currency", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Timezone", { exact: true })).toBeDisabled();
  expect(
    (
      await page.request.put(`/api/v1/businesses/${business.id}`, {
        headers: { origin },
        data: { ...input, currency: "USD", version: locked.version },
      })
    ).status(),
  ).toBe(409);
  await page
    .getByLabel("Business name", { exact: true })
    .fill("Allowed profile change");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Business changes saved",
  );
});
