// Run on the server and pass options to the client, avoiding ICU version differences.
export function getBusinessFormOptions(currentTimezone?: string) {
  const currencies = Intl.supportedValuesOf("currency");
  const names = new Intl.DisplayNames(["en"], { type: "currency" });
  const timezones = [
    ...new Set([
      "UTC",
      ...Intl.supportedValuesOf("timeZone"),
      ...(currentTimezone ? [currentTimezone] : []),
    ]),
  ].sort();
  return {
    currencies: currencies.map((code) => ({
      code,
      label: `${code} — ${names.of(code) ?? code}`,
    })),
    timezones,
  };
}

export type BusinessFormOptions = ReturnType<typeof getBusinessFormOptions>;
