import "server-only";
import { createReportSummarizer } from "./provider";
export function getReportSummarizer() {
  return createReportSummarizer(process.env);
}
