const US_EASTERN_TIME_ZONE = "America/New_York"

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/** Pre-market through after-hours: 4:00 AM–8:00 PM Eastern, weekdays. */
const EXTENDED_SESSION_START_MINUTES = 4 * 60
const EXTENDED_SESSION_END_MINUTES = 20 * 60

function getEasternWallClock(date: Date): {
  dayOfWeek: number
  minutesOfDay: number
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: US_EASTERN_TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  let weekday = ""
  let hour = 0
  let minute = 0

  for (const part of parts) {
    if (part.type === "weekday") {
      weekday = part.value
    }
    if (part.type === "hour") {
      hour = Number(part.value)
    }
    if (part.type === "minute") {
      minute = Number(part.value)
    }
  }

  return {
    dayOfWeek: WEEKDAY_TO_INDEX[weekday] ?? -1,
    minutesOfDay: hour * 60 + minute,
  }
}

export function isUsExtendedMarketSessionOpen(now = new Date()): boolean {
  const { dayOfWeek, minutesOfDay } = getEasternWallClock(now)

  if (dayOfWeek < 1 || dayOfWeek > 5) {
    return false
  }

  return (
    minutesOfDay >= EXTENDED_SESSION_START_MINUTES &&
    minutesOfDay < EXTENDED_SESSION_END_MINUTES
  )
}
