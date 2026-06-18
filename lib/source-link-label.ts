const MAX_HOST_LENGTH = 8

export function formatSourceLinkLabel(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "")
    if (hostname.length <= MAX_HOST_LENGTH) {
      return hostname
    }
    return `${hostname.slice(0, MAX_HOST_LENGTH)}…`
  } catch {
    return url.length <= MAX_HOST_LENGTH ? url : `${url.slice(0, MAX_HOST_LENGTH)}…`
  }
}
