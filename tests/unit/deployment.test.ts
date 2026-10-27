import { expect, test } from "vitest";
import { readMigrationDatabaseUrl } from "@/lib/validation/environment";
import { checkDeploymentEnvironment } from "@/lib/deployment/environment";
import { readDemoDatabaseUrl } from "../../scripts/demo/environment";
import { buildDemoData } from "../../scripts/demo/data";
import { NVIDIA_ASSISTANT_MODEL, NVIDIA_MODEL } from "@/lib/ai/models";

const environment = {
  DATABASE_URL:
    "postgresql://app:example@pool.example.com/basira?sslmode=require",
  DIRECT_URL:
    "postgresql://operator:example@direct.example.com/basira?sslmode=require",
  NEXTAUTH_URL: "https://basira.example.com",
  NEXTAUTH_SECRET: "synthetic-test-value-with-at-least-32-characters",
};
test("migration CLI selects the direct endpoint while local setups retain their URL", () => {
  expect(readMigrationDatabaseUrl(environment)).toBe(environment.DIRECT_URL);
  expect(
    readMigrationDatabaseUrl({ DATABASE_URL: environment.DATABASE_URL }),
  ).toBe(environment.DATABASE_URL);
  expect(() =>
    readMigrationDatabaseUrl({
      ...environment,
      DIRECT_URL: environment.DIRECT_URL.replace("/basira?", "/another?"),
    }),
  ).toThrow("same database");
});
test("production preflight permits deferred providers and reports no secrets", () => {
  expect(checkDeploymentEnvironment(environment).errors).toEqual([]);
  const bad = checkDeploymentEnvironment({
    ...environment,
    DATABASE_URL: "https://user:private-password@example.com/basira",
    NEXTAUTH_URL: "http://localhost:3000",
    NEXTAUTH_SECRET: "short",
    GOOGLE_CLIENT_ID: "only-id",
    TEST_DATABASE_URL: "present",
  });
  expect(bad.errors).toHaveLength(5);
  expect(JSON.stringify(bad)).not.toContain("private-password");
});
test("preflight rejects unsafe destinations, missing TLS, invalid origins and unsupported AI", () => {
  expect(
    checkDeploymentEnvironment({
      ...environment,
      DATABASE_URL: "postgresql://app:example@localhost/basira_test",
      DIRECT_URL: "",
      NEXTAUTH_URL: "https://basira.example.com/login",
      NVIDIA_API_KEY: "invalid",
      NVIDIA_MODEL: "unreviewed",
    }).errors,
  ).toHaveLength(5);
});
test("preflight validates the assistant model independently of feedback and reports", () => {
  const configured = {
    ...environment,
    NVIDIA_API_KEY: "nvapi-synthetic-key",
    NVIDIA_MODEL,
    NVIDIA_ASSISTANT_MODEL,
  };
  expect(checkDeploymentEnvironment(configured).errors).toEqual([]);
  expect(
    checkDeploymentEnvironment({
      ...configured,
      NVIDIA_ASSISTANT_MODEL: "unreviewed/private-value",
    }).errors,
  ).toEqual([
    `Use the implemented NVIDIA_ASSISTANT_MODEL: ${NVIDIA_ASSISTANT_MODEL}.`,
  ]);
});
test("demo seeding is confined to explicit loopback development databases", () => {
  const local = {
    DATABASE_URL:
      "postgresql://app:example@localhost:5433/basira_dev?schema=public",
  };
  expect(readDemoDatabaseUrl(local)).toBe(local.DATABASE_URL);
  for (const override of [
    { NODE_ENV: "production" },
    { VERCEL: "1" },
    { CI: "true" },
    {
      DATABASE_URL: local.DATABASE_URL.replace(
        "localhost",
        "remote.example.com",
      ),
    },
    { DATABASE_URL: local.DATABASE_URL.replace("basira_dev", "basira_test") },
    { DATABASE_URL: local.DATABASE_URL + "&host=remote.example.com" },
    { DATABASE_URL: local.DATABASE_URL.replace("public", "other") },
  ])
    expect(() => readDemoDatabaseUrl({ ...local, ...override })).toThrow();
});
test("demo history is deterministic, calendar-safe and preserves zero visits and unknown costs", () => {
  const dataset = buildDemoData("2024-03-01");
  expect(dataset).toEqual(buildDemoData("2024-03-01"));
  const [cafe, studio] = dataset;
  expect(cafe!.customers).toHaveLength(210);
  expect(studio!.customers).toHaveLength(21);
  expect(
    cafe!.customers.some((row) =>
      row.metricDate.toISOString().startsWith("2024-02-29"),
    ),
  ).toBe(true);
  expect(studio!.customers.some((row) => row.customerCount === 0)).toBe(true);
  expect(cafe!.sales.some((row) => row.unitCost === null)).toBe(true);
  expect(
    cafe!.sales.every((row) => row.saleDate <= new Date("2024-03-01")),
  ).toBe(true);
  expect(cafe!.expenses.some((row) => row.categoryName === "Inventory")).toBe(
    true,
  );
});
