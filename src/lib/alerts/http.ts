import { z } from "zod";
import { alertListSchema } from "./contracts";
export function readAlertQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
    throw new z.ZodError([
      { code: "custom", path: [], message: "Use each alert filter only once." },
    ]);
  return alertListSchema.parse(Object.fromEntries(params));
}
