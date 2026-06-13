export function formatIssuerHeading(
  symbol: string,
  companyName?: string,
): string {
  return companyName ? `${companyName} (${symbol})` : symbol
}
