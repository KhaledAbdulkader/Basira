import "server-only";
import { createNvidiaAnalyzer } from "./provider";
export function getFeedbackAnalyzer() {
  return createNvidiaAnalyzer(process.env);
}
