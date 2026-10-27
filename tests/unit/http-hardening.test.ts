// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { readLimitedText, readQuery } from "@/lib/http/request";
import { adminQuery, adminUsersQuery } from "@/lib/admin/contracts";
import { readReportQuery } from "@/lib/reports/http";
import { readImportUpload } from "@/lib/imports/http";
const origin = "http://localhost:3000";
afterEach(() => vi.unstubAllEnvs());

function streamed(chunks: Uint8Array[], cancel = vi.fn()) {
  return new Request(origin, {
    method: "POST",
    duplex: "half",
    body: new ReadableStream({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
      cancel,
    }),
  } as RequestInit);
}
test("bounded decoding accepts split UTF-8 and rejects invalid or truncated encoding", async () => {
  const bytes = new TextEncoder().encode("سَلام café");
  expect(
    await readLimitedText(streamed([...bytes].map((b) => new Uint8Array([b])))),
  ).toBe("سَلام café");
  for (const bytes of [[0xff], [0xe2, 0x82]]) {
    await expect(
      readLimitedText(streamed([new Uint8Array(bytes)])),
    ).rejects.toMatchObject({ status: 400 });
  }
});
test("byte limits use actual streamed content and tolerate failed cancellation", async () => {
  const cancel = vi
    .fn()
    .mockRejectedValue(
      new Error("Disconnected with sensitive transport details"),
    );
  await expect(
    readLimitedText(
      streamed([new Uint8Array(20), new Uint8Array(20)], cancel),
      10,
    ),
  ).rejects.toMatchObject({ status: 413 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(cancel).toHaveBeenCalledOnce();
});
test("query parsing rejects repeated encoded keys and preserves prototype keys for validation", () => {
  for (const query of ["page=1&page=2", "page=1&%70age=2"]) {
    expect(() => readQuery(new Request(origin + "?" + query))).toThrow(
      "filter once",
    );
  }
  expect(() =>
    readQuery(new Request(origin + "?ownerId=x"), ["page"]),
  ).toThrow();
  const request = new Request(origin + "?__proto__=ignored");
  expect(Object.hasOwn(readQuery(request), "__proto__")).toBe(true);
  expect(() => adminUsersQuery.parse(adminQuery(request))).toThrow();
  expect(() => readReportQuery(request)).toThrow();
  expect(readQuery(new Request(origin + "?page=2"), ["page"])).toEqual({
    page: "2",
  });
});
test("interrupted multipart uploads return a safe client error", async () => {
  vi.stubEnv("NEXTAUTH_URL", origin);
  const request = new Request(origin, {
    method: "POST",
    duplex: "half",
    headers: { origin, "content-type": "multipart/form-data; boundary=test" },
    body: new ReadableStream({
      start(controller) {
        controller.error(new Error("PRIVATE_SOCKET_DETAILS"));
      },
    }),
  } as RequestInit);
  await expect(readImportUpload(request)).rejects.toMatchObject({
    status: 400,
    message: "The upload was interrupted. Choose your file again.",
  });
});
