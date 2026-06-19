export function normalizeSourceUrl(value: string): string {
  try {
    const url = new URL(value)
    url.hash = ""

    return url.toString()
  } catch {
    return value
  }
}
