import { hasConfiguredValue } from "../auth/environment";
import { NVIDIA_MODEL_CONFIG } from "../ai/models";
import { readMigrationDatabaseUrl } from "../validation/environment";

export function checkDeploymentEnvironment(
  environment: Record<string, string | undefined>,
) {
  const errors: string[] = [];
  const notes: string[] = [];
  try {
    readMigrationDatabaseUrl(environment);
    for (const value of [
      environment.DATABASE_URL,
      environment.DIRECT_URL,
    ].filter(Boolean)) {
      const url = new URL(value!);
      if (
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        /_(test|dev|demo|shadow)$/.test(url.pathname)
      )
        errors.push(
          "Use a dedicated hosted production database, not a local, demo, development or test database.",
        );
      if (
        !["require", "verify-ca", "verify-full"].includes(
          url.searchParams.get("sslmode") ?? "",
        )
      )
        errors.push(
          "Use the provider's TLS-enabled PostgreSQL connection URL (sslmode=require or stronger).",
        );
    }
  } catch {
    errors.push(
      "Configure DATABASE_URL and, if used, DIRECT_URL for the same PostgreSQL database.",
    );
  }
  const origin = environment.NEXTAUTH_URL;
  if (!origin || !URL.canParse(origin))
    errors.push("Set NEXTAUTH_URL to the canonical HTTPS origin.");
  else {
    const url = new URL(origin);
    if (
      url.protocol !== "https:" ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      errors.push(
        "NEXTAUTH_URL must be a hosted HTTPS origin without paths, credentials or query parameters.",
      );
  }
  if (
    !hasConfiguredValue(environment.NEXTAUTH_SECRET) ||
    environment.NEXTAUTH_SECRET.length < 32
  )
    errors.push(
      "Set an independent random NEXTAUTH_SECRET of at least 32 characters.",
    );
  const googleId = hasConfiguredValue(environment.GOOGLE_CLIENT_ID);
  const googleSecret = hasConfiguredValue(environment.GOOGLE_CLIENT_SECRET);
  if (googleId !== googleSecret)
    errors.push(
      "Configure both Google OAuth variables together, or leave both unset.",
    );
  else
    notes.push(
      googleId
        ? "Google credentials are present; verify the actual callback and sign-in separately."
        : "Google sign-in is disabled until credentials are configured.",
    );
  if (hasConfiguredValue(environment.NVIDIA_API_KEY)) {
    if (
      !/^nvapi-[A-Za-z0-9_-]+$/.test(environment.NVIDIA_API_KEY) ||
      environment.NVIDIA_API_KEY.length > 512
    )
      errors.push("NVIDIA_API_KEY has an unsupported format.");
    for (const { environmentKey, model } of Object.values(
      NVIDIA_MODEL_CONFIG,
    )) {
      if ((environment[environmentKey]?.trim() || model) !== model)
        errors.push(`Use the implemented ${environmentKey}: ${model}.`);
    }
    notes.push(
      "AI credentials are present; live availability and quota still require a smoke test.",
    );
  } else
    notes.push(
      "AI is unconfigured; dashboards, forecasts and deterministic reports work without it.",
    );
  if (environment.TEST_DATABASE_URL || environment.SHADOW_DATABASE_URL)
    errors.push(
      "Do not supply TEST_DATABASE_URL or SHADOW_DATABASE_URL to the production environment.",
    );
  return { errors: [...new Set(errors)], notes };
}
