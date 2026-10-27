import "server-only";
import { createBusinessAssistant } from "./provider";
export function getBusinessAssistant() {
  return createBusinessAssistant(process.env);
}
