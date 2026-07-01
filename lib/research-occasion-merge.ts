/** Shared prompt guidance for merging same real-world occasions across sources. */

export function formatResearchOccasionMergeBlock(): string {
  return [
    "When sources describe the same dated or named real-world occasion under different headlines, output one merged event — not separate rows that differ only by editorial angle, detail level, or companion product mentions at the same site.",
    "Merge when any of: the same product or program plus the same site or facility plus the same milestone type (production start, facility opening, deliveries report, conference, investor day, earnings release); the same official proceeding ID; or clearly the same occasion where one row is generic and another names the site or timing.",
    "Put secondary product or capacity detail for the same ramp (e.g. a companion SKU at the same factory start) in summary and whyItMatters — not a second row.",
    "Do not stitch conflicting calendar anchors, share counts, or percentages from different sources into one event unless one source states them together.",
  ].join("\n")
}

export function formatResearchCatalystThreadCoherenceBlock(): string {
  return [
    "Roundup articles can support multiple catalyst rows, but each row must stay on one catalyst thread.",
    "For each row, the title, timing fields, summary, whyItMatters, and cited sources must describe the same catalyst thread; do not take a title from one section and timing or summary from another.",
    "The facility or site named in the title must match the site discussed in summary and sources; if they differ, split into separate rows or fix the title — do not output one site in the title with another site only in the body.",
    "Title and whyItMatters must address the same milestone — if whyItMatters discusses a different product, proceeding, or outcome than the title names, split rows or rewrite so they align.",
    "Do not mix covered fiscal/report periods with publication timing: when a row is about a quarterly report or disclosure, title and summary name the covered period while timing fields anchor the expected release month or date — not the quarter being reported on.",
    "If a roundup source discusses unrelated catalysts, split them into separate rows with matching title, timing, summary, and source support; if a coherent row cannot be formed, omit it.",
    "Past dates are valid as timing only when they mark the start of an active ongoing catalyst; stale one-time events should be excluded or reframed around a source-backed future milestone.",
  ].join("\n")
}

export function formatResearchOccasionReportBlock(): string {
  return [
    "For each distinct real-world occasion, write one catalyst entry with the site or venue, expected timing, and milestone type stated once.",
    "Do not list the same production start, facility opening, or conference twice under different headlines.",
  ].join("\n")
}

export function formatResearchOccasionExtractionSelfCheck(): string {
  return [
    "Before returning JSON, merge rows that describe the same dated or named occasion — not only regulatory proceedings, investigations, or litigation.",
    "Re-read each row: title, summary, whyItMatters, timing fields, and every cited source must support the same occasion; fix or split rows where title and whyItMatters disagree or where timing reflects a publication date but summary only names a covered fiscal quarter (or vice versa).",
    "If summary or sources name a month, quarter, year, or date range, timingShape must not be unknown.",
    "Set timingQualifier to early, mid, or late only when sources explicitly use that coarse placement (e.g. early July, late Q4); otherwise null.",
  ].join(" ")
}
