// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { readImportUpload } from "@/lib/imports/http";
import { IMPORT_LIMITS } from "@/lib/imports/constants";

const origin = "http://localhost:3000";
function request(confirm = false) {
  vi.stubEnv("NEXTAUTH_URL", origin);
  const body = new FormData();
  body.set(
    "file",
    new File(["date,feedback_text\n2026-09-20,Good"], "feedback.csv", {
      type: "text/csv",
    }),
  );
  body.set("importType", "FEEDBACK");
  if (confirm) {
    body.set("confirmed", "true");
    body.set("token", "signed.preview");
  }
  return {
    body,
    build: (headers = { origin }) =>
      new Request(origin + "/imports", { method: "POST", headers, body }),
  };
}
afterEach(() => vi.unstubAllEnvs());
test("multipart parsing accepts one bounded file and explicit confirmation", async () => {
  const input = await readImportUpload(request(true).build(), true);
  expect(input).toMatchObject({
    importType: "FEEDBACK",
    confirmed: true,
    token: "signed.preview",
    file: { name: "feedback.csv" },
  });
  expect(new TextDecoder().decode(input.file.bytes)).toContain("Good");
});
test("multipart mutations reject cross-origin, extra fields and repeated parts", async () => {
  await expect(
    readImportUpload(request().build({ origin: "https://evil.example" })),
  ).rejects.toMatchObject({ status: 403 });
  const extra = request();
  extra.body.set("businessId", "injected");
  await expect(readImportUpload(extra.build())).rejects.toMatchObject({
    status: 400,
  });
  const repeated = request();
  repeated.body.append("importType", "SALES");
  await expect(readImportUpload(repeated.build())).rejects.toMatchObject({
    status: 400,
  });
  const unconfirmed = request(true);
  unconfirmed.body.set("confirmed", "false");
  await expect(
    readImportUpload(unconfirmed.build(), true),
  ).rejects.toMatchObject({ status: 400 });
});
test("multipart size is bounded even without a Content-Length header", async () => {
  vi.stubEnv("NEXTAUTH_URL", origin);
  const request = new Request(origin + "/imports", {
    method: "POST",
    headers: { origin, "content-type": "multipart/form-data; boundary=x" },
    body: new Uint8Array(IMPORT_LIMITS.requestBytes + 1),
  });
  expect(request.headers.has("content-length")).toBe(false);
  await expect(readImportUpload(request)).rejects.toMatchObject({
    status: 413,
  });
});
