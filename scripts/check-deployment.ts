import { config } from "dotenv";
import { checkDeploymentEnvironment } from "../src/lib/deployment/environment";

// An explicit file avoids mixing local test/shadow values into a production check.
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--env-file")) {
  console.error(
    "Usage: npm run deploy:check -- [--env-file .env.production.local]",
  );
  process.exitCode = 1;
} else {
  const loaded = args[1]
    ? config({ path: args[1], quiet: true, processEnv: {} })
    : undefined;
  if (loaded?.error) {
    console.error("Cannot read the requested environment file.");
    process.exitCode = 1;
  } else {
    const result = checkDeploymentEnvironment(loaded?.parsed ?? process.env);
    result.errors.forEach((message) => console.error(`FAIL: ${message}`));
    result.notes.forEach((message) => console.info(`NOTE: ${message}`));
    if (result.errors.length) process.exitCode = 1;
    else
      console.info(
        "PASS: production configuration shape. No database or provider connection was attempted.",
      );
  }
}
