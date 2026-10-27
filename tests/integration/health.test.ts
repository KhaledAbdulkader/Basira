// @vitest-environment node
import { expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

it("exposes only liveness and prevents caching", async () => {
  const response = GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok" });
});
