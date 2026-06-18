/** Extraction guidance for broad coverage without steering hosted search. */

export function formatResearchBreadthExtractionBlock(): string {
  return [
    "Cover all distinct milestone families that the reports or snippets support—product lines, technology programs, manufacturing or capacity, geographic or regulatory expansion, software or services, corporate actions, earnings, and similar themes.",
    "When the evidence discusses several unrelated families, include representative events for each family. Do not collapse output to a single narrative if other major families are also sourced.",
    "Use status 'likely' or 'speculative' with date windows when timing is inferred from reporting or cadence. Use from for not-yet-started milestones and open for already-underway work; never substitute today's run date for a real start date.",
  ].join("\n")
}

/** Extraction guidance for structured timing fields (timingShape, periodKey, dates). */
export function formatResearchTimingExtractionBlock(): string {
  return [
    "Populate timingShape and periodKey/expectedDate/window fields on every event — prose in summary alone does not satisfy timing. If the event title or sources name a fiscal/calendar quarter (Q1–Q4 plus year, or 'first quarter 2026'), set timingShape to period, periodKey to YYYY-Qn (canonical form, capital Q, e.g. 2026-Q2), and datePrecision to quarter. This is structuring the event's defining anchor, not inventing dates.",
    "Quarterly vehicle production/delivery reports, deliveries press releases, and similar recurring operational disclosures follow the same rule even when the exact release day is not cited. For those reports, periodKey is the fiscal quarter the data covers (from the title), not the calendar month of release.",
    "When sources give a release month or window (e.g. early July 2026), include it in summary. Prefer period plus quarter periodKey for quarter-named reports. Use point, closed_window, or by only when the event is primarily defined by a release date, not a fiscal quarter report.",
    "Use status likely or speculative with lower confidence when timing is inferred from cadence or reporting — but still populate periodKey, not unknown.",
    "Reserve timingShape unknown only when no year, quarter, month, deadline, or bounded window appears in the event title or cited sources. A provider report saying 'timing unclear' does not override a quarter named in the title or snippets.",
    "Anti-inference scope: never anchor windowStart to today's run date or windowEnd to the 12-month research horizon unless a source explicitly does. Allowed: extracting 2026-Q2 from 'Q2 2026 Vehicle Production & Deliveries Report' or matching source text.",
  ].join("\n")
}

/** Hosted-search guidance for stating timing explicitly in report prose. */
export function formatResearchTimingReportBlock(): string {
  return [
    "For quarter-named milestones (Q1–Q4 plus year), state the fiscal quarter explicitly (YYYY-Qn) and the expected release month or window when sources support it.",
    "Treat quarterly vehicle production/delivery reports and similar operational disclosures as first-class catalysts: name the quarter covered and when the report is expected (e.g. Q2 2026 deliveries, expected early July 2026).",
    "Use 'timing unclear' only when no year, quarter, month, or date anchor appears in sources — not when the milestone name itself names a quarter.",
  ].join("\n")
}
