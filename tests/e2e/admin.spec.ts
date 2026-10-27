import { randomUUID } from "node:crypto";
import { authenticatedTest as test, expect, signInRequest } from "./fixtures";
import { testDatabase as db } from "../helpers/database";
import { createBusiness } from "../../src/lib/business/service";
const headers = { origin: "http://127.0.0.1:3100" };

test("admin statistics, confirmed suspension and activation update existing sessions across themes", async ({
  page,
  account,
  browser,
}, testInfo) => {
  await db.user.update({ where: { id: account.id }, data: { role: "ADMIN" } });
  const source = await db.user.findUniqueOrThrow({
    where: { id: account.id },
    select: { passwordHash: true },
  });
  const owner = await db.user.create({
    data: {
      email: `${randomUUID()}@admin-browser.example`,
      name: "Managed cafe owner",
      passwordHash: source.passwordHash,
    },
  });
  const ownerContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
  });
  try {
    const b = await createBusiness(db, owner.id, {
      name: "Managed cafe",
      businessType: "CAFE",
      currency: "SAR",
      timezone: "UTC",
    });
    const ownerPage = await ownerContext.newPage();
    await signInRequest(ownerPage.request, {
      ...owner,
      password: account.password,
    });
    await page.goto("/");
    if (testInfo.project.name !== "desktop-chromium")
      await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("link", { name: "Admin", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "System statistics", exact: true }),
    ).toBeVisible();
    for (const label of [
      "Total users",
      "Active users",
      "Suspended users",
      "Total businesses",
    ])
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("admin-statistics-light.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Toggle color theme" }).click();
    await page.screenshot({
      path: testInfo.outputPath("admin-statistics-dark.png"),
      fullPage: true,
    });
    await page
      .getByRole("navigation", { name: "Administration navigation" })
      .getByRole("link", { name: "Users", exact: true })
      .click();
    await page.getByLabel("Search users", { exact: true }).fill(owner.email);
    await page.getByRole("button", { name: "Apply filters" }).click();
    const card = page.getByRole("article", { name: owner.email, exact: true });
    await expect(card).toContainText("Active");
    await card.getByRole("button", { name: "Suspend user" }).click();
    const dialog = page.getByRole("dialog", { name: "Suspend this account?" });
    await expect(dialog).toContainText(owner.email);
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.screenshot({
      path: testInfo.outputPath("admin-suspend-dialog.png"),
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect((await ownerPage.request.get("/api/me")).status()).toBe(200);
    await card.getByRole("button", { name: "Suspend user" }).click();
    await dialog.getByRole("button", { name: "Confirm suspend" }).click();
    await expect(
      card.getByRole("button", { name: "Activate user" }),
    ).toBeVisible();
    expect((await ownerPage.request.get("/api/me")).status()).toBe(401);
    expect(
      (
        await ownerPage.request.get(`/api/v1/businesses/${b.id}/sales`)
      ).status(),
    ).toBe(401);
    await ownerPage.goto("/sales");
    await expect(ownerPage).toHaveURL(/\/login$/);
    await page.screenshot({
      path: testInfo.outputPath("admin-users-dark.png"),
      fullPage: true,
    });
    await card.getByRole("button", { name: "Activate user" }).click();
    await page
      .getByRole("dialog", { name: "Activate this account?" })
      .getByRole("button", { name: "Confirm activate" })
      .click();
    await expect(
      card.getByRole("button", { name: "Suspend user" }),
    ).toBeVisible();
    expect((await ownerPage.request.get("/api/me")).status()).toBe(200);
    expect(await db.business.count({ where: { id: b.id } })).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await ownerContext.close();
    await db.business.deleteMany({ where: { ownerId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});

test("admin HTTP and pages enforce current role, strict status changes, origin and private-content boundaries", async ({
  page,
  account,
  request,
}) => {
  const paths = [
    "/api/v1/admin/statistics",
    "/api/v1/admin/users",
    "/api/v1/admin/businesses",
  ];
  for (const url of paths) {
    expect((await request.get(url)).status()).toBe(401);
    expect((await page.request.get(url)).status()).toBe(403);
  }
  await page.goto("/admin/users");
  await expect(
    page.getByRole("heading", { name: "Administration unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Admin", exact: true }),
  ).toHaveCount(0);
  await db.user.update({ where: { id: account.id }, data: { role: "ADMIN" } });
  const owner = await db.user.create({
    data: {
      email: `${randomUUID()}@admin-private.example`,
      name: "Private owner",
      passwordHash: "PRIVATE_HASH",
      image: "https://private.example/avatar",
    },
  });
  const endpoint = `/api/v1/admin/users/${owner.id}/status`,
    body = { status: "SUSPENDED", version: 1, confirmed: true };
  try {
    const b = await createBusiness(db, owner.id, {
      name: "Directory entry",
      location: "PRIVATE_LOCATION",
      businessType: "CAFE",
      currency: "SAR",
      timezone: "UTC",
    });
    for (const url of paths) {
      const response = await page.request.get(url);
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect(await response.text()).not.toMatch(
        /PRIVATE_HASH|PRIVATE_LOCATION|passwordHash|https:\/\/private\.example\/avatar|aiSummary|snapshot|revenue/,
      );
    }
    for (const suffix of [
      "",
      "/sales",
      "/expenses",
      "/feedback",
      "/reports",
      "/conversations",
      "/dashboard",
    ])
      expect(
        (
          await page.request.get(`/api/v1/businesses/${b.id}${suffix}`)
        ).status(),
      ).toBe(404);
    expect(
      (
        await page.request.post("/api/v1/businesses/selection", {
          headers,
          data: { businessId: b.id },
        })
      ).status(),
    ).toBe(404);
    expect(
      (await request.patch(endpoint, { headers, data: body })).status(),
    ).toBe(401);
    expect(
      (
        await page.request.patch(endpoint, {
          headers: { origin: "https://foreign.example" },
          data: body,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.patch(endpoint, {
          headers: { ...headers, "content-type": "text/plain" },
          data: "{}",
        })
      ).status(),
    ).toBe(415);
    expect(
      (
        await page.request.patch(endpoint, {
          headers,
          data: { ...body, role: "ADMIN" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.patch(endpoint, {
          headers,
          data: { ...body, confirmed: false },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.patch(endpoint, {
          headers,
          data: { ...body, ignored: "x".repeat(9000) },
        })
      ).status(),
    ).toBe(413);
    expect(
      (await page.request.get("/api/v1/admin/users?page=1&page=2")).status(),
    ).toBe(400);
    expect(
      (
        await page.request.get("/api/v1/admin/businesses?ownerId=forged")
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.get("/api/v1/admin/statistics?ignored=true")
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.patch(`/api/v1/admin/users/${account.id}/status`, {
          headers,
          data: body,
        })
      ).status(),
    ).toBe(409);
    expect(
      (await page.request.patch(endpoint, { headers, data: body })).status(),
    ).toBe(200);
    expect(
      (
        await page.request.patch(endpoint, {
          headers,
          data: { ...body, status: "ACTIVE" },
        })
      ).status(),
    ).toBe(409);
    await db.user.update({ where: { id: account.id }, data: { role: "USER" } });
    for (const url of paths)
      expect((await page.request.get(url)).status()).toBe(403);
    expect(
      (
        await page.request.patch(endpoint, {
          headers,
          data: { ...body, version: 2, status: "ACTIVE" },
        })
      ).status(),
    ).toBe(403);
    await page.goto("/admin/businesses");
    await expect(
      page.getByRole("heading", { name: "Administration unavailable" }),
    ).toBeVisible();
    await db.user.update({
      where: { id: account.id },
      data: { role: "ADMIN", status: "SUSPENDED" },
    });
    expect((await page.request.get(paths[0]!)).status()).toBe(401);
  } finally {
    await db.user.update({
      where: { id: account.id },
      data: { status: "ACTIVE" },
    });
    await db.business.deleteMany({ where: { ownerId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});

test("business metadata search, filters and real pagination do not change the selected workspace", async ({
  page,
  account,
}, testInfo) => {
  await db.user.update({ where: { id: account.id }, data: { role: "ADMIN" } });
  const mine = await createBusiness(db, account.id, {
    name: "Admin own workspace",
    businessType: "CAFE",
    currency: "SAR",
    timezone: "UTC",
  });
  await page.request.post("/api/v1/businesses/selection", {
    headers,
    data: { businessId: mine.id },
  });
  const owner = await db.user.create({
    data: {
      email: `${randomUUID()}@directory-browser.example`,
      name: "Directory owner",
    },
  });
  const marker = randomUUID();
  try {
    await db.business.createMany({
      data: Array.from({ length: 21 }, (_, i) => ({
        ownerId: owner.id,
        name: `${marker} Cafe ${i}`,
        businessType: i === 20 ? ("RETAIL" as const) : ("CAFE" as const),
        currency: "SAR",
        timezone: "UTC",
      })),
    });
    await page.goto("/admin/businesses");
    await page.getByLabel("Search businesses", { exact: true }).fill(marker);
    await page.getByRole("button", { name: "Apply filters" }).click();
    const region = page.getByRole("region", {
      name: "Business results",
      exact: true,
    });
    await expect(region.getByRole("article")).toHaveCount(20);
    await page
      .getByRole("navigation", { name: "Administration pagination" })
      .getByRole("link", { name: "Next" })
      .click();
    await expect(region.getByRole("article")).toHaveCount(1);
    await page
      .getByLabel("Business type", { exact: true })
      .selectOption("RETAIL");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(region).toContainText(`${marker} Cafe 20`);
    await expect(
      page.getByRole("navigation", { name: "Administration pagination" }),
    ).toContainText("Page 1 of 1");
    await page.screenshot({
      path: testInfo.outputPath("admin-businesses.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByLabel("Search businesses", { exact: true })
      .fill("No match expected");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(region).toContainText("No businesses match");
    await page.goto("/sales");
    await expect(page.getByRole("main")).toContainText(mine.name);
  } finally {
    await db.business.deleteMany({ where: { ownerId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});
