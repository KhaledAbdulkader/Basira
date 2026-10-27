export function hasConfiguredValue(value: string | undefined): value is string {
  return Boolean(value?.trim() && !value.startsWith("REPLACE_WITH_"));
}

export function googleIsConfigured() {
  return (
    hasConfiguredValue(process.env.GOOGLE_CLIENT_ID) &&
    hasConfiguredValue(process.env.GOOGLE_CLIENT_SECRET)
  );
}

export function readAuthSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!hasConfiguredValue(secret) || secret.length < 32) {
    throw new Error(
      "Set NEXTAUTH_SECRET to a random secret of at least 32 characters.",
    );
  }
  return secret;
}

export function readAuthOrigin() {
  const value = process.env.NEXTAUTH_URL;
  if (!value || !URL.canParse(value))
    throw new Error("Set NEXTAUTH_URL to the application origin.");
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("NEXTAUTH_URL must contain only the application origin.");
  }
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    throw new Error("Use HTTPS for a non-local NEXTAUTH_URL.");
  }
  return url.origin;
}
