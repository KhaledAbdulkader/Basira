import { Prisma } from "@/generated/prisma/client";
import { businessFailure } from "@/lib/business/http";
import { privateJson, RequestError } from "@/lib/http/request";
import { ForecastError } from "./contracts";

export function readForecastQuery(request: Request, allowed: string[]) {
  const query = new URL(request.url).searchParams;
  for (const key of query.keys())
    if (!allowed.includes(key) || query.getAll(key).length !== 1)
      throw new RequestError(400, "Use each supported forecast filter once.");
  return Object.fromEntries(query);
}
export function forecastFailure(error: unknown) {
  if (error instanceof ForecastError)
    return privateJson({ message: error.message }, error.status);
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2034"].includes(error.code)
  )
    return privateJson(
      {
        message:
          "Forecast history changed during the request. Refresh and check saved forecasts before retrying.",
      },
      409,
    );
  return businessFailure(error);
}
