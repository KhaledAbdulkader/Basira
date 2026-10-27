import { readQuery } from "@/lib/http/request";
import { reportListSchema } from "./contracts";
export function readReportQuery(request: Request) {
  return reportListSchema.parse(readQuery(request));
}
