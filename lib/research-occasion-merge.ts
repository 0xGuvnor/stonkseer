/** Shared prompt guidance for merging same real-world occasions across sources. */

export function formatResearchOccasionMergeBlock(): string {
  return [
    "When sources describe the same dated or named real-world occasion under different headlines, output one merged event — not separate rows that differ only by editorial angle, detail level, or companion product mentions at the same site.",
    "Merge when any of: the same product or program plus the same site or facility plus the same milestone type (production start, facility opening, deliveries report, conference, investor day, earnings release); the same official proceeding ID; or clearly the same occasion where one row is generic and another names the site or timing.",
    "Put secondary product or capacity detail for the same ramp (e.g. a companion SKU at the same factory start) in summary and whyItMatters — not a second row.",
    "Do not stitch conflicting calendar anchors, share counts, or percentages from different sources into one event unless one source states them together.",
  ].join("\n")
}

export function formatResearchOccasionReportBlock(): string {
  return [
    "For each distinct real-world occasion, write one catalyst entry with the site or venue, expected timing, and milestone type stated once.",
    "Do not list the same production start, facility opening, or conference twice under different headlines.",
  ].join("\n")
}

export function formatResearchOccasionExtractionSelfCheck(): string {
  return "Before returning JSON, merge rows that describe the same dated or named occasion — not only regulatory proceedings, investigations, or litigation."
}
