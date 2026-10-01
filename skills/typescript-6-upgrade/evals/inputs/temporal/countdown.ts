// Countdown helpers for the launch banner.

export function daysUntilLaunch(launchDate: string): number {
  const target = new Date(launchDate)
  const now = new Date()
  const diffMs = target.getTime() - now.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

export function addBusinessWeek(date: Date): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + 7)
  return result
}

export function formatLaunch(launchDate: string): string {
  const d = new Date(launchDate)
  // month is 0-indexed, so we add 1 — classic Date footgun
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
