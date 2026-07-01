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
    "Populate timingShape and periodKey/expectedDate/window fields on every event — prose in summary alone does not satisfy timing. Timing fields answer when the catalyst happens (publication, deadline, start of activity), not which fiscal period a report covers — put the covered quarter in the title and summary.",
    "Publication and disclosure catalysts (earnings releases, vehicle production/delivery reports, SEC filings, press releases, data readouts, shareholder meetings) anchor timing to the expected publication or occurrence date. Example: 'Q2 2026 Vehicle Production & Deliveries Report, expected early July 2026' → timingShape period, periodKey 2026-07, timingQualifier early, datePrecision month — not 2026-Q2. The title names which report; timing is when it is expected.",
    "Use timingQualifier early, mid, or late only when sources explicitly use that coarse placement inside a month, quarter, half, or year (e.g. early July, mid-2026, late Q4). Do not invent qualifiers; omit (null) when sources give only a month or quarter without early/mid/late wording.",
    "Use timingShape period with YYYY-Qn and datePrecision quarter only when the catalyst is defined by activity during that quarter (e.g. production ramp through Q2, guidance for FY2026), not when it is a report about that quarter.",
    "For month-fuzzy anchors, prefer timingShape period with periodKey YYYY-MM and datePrecision month — not partial windowStart values like 2026-04 without a day. Use point or from only when a specific day is source-backed.",
    "When sources give only the covered quarter but release timing is inferable from cadence or prior reporting, anchor the expected release month with status likely or speculative and lower confidence — do not fall back to the covered quarter as periodKey.",
    "Reserve timingShape unknown only when no year, quarter, month, deadline, or bounded window appears in the event title or cited sources. A provider report saying 'timing unclear' does not override a release month or quarter named in snippets.",
    "Multi-quarter spans (e.g. Q3–Q4 2026) → timingShape closed_window with ISO month bounds (start of first quarter through end of last) or timingShape period with periodKey 2026-H2 when that half-year matches; never unknown when a range is stated.",
    "Anti-inference scope: never anchor windowStart to today's run date or windowEnd to the 12-month research horizon unless a source explicitly does. Allowed: extracting 2026-07 from 'expected early July 2026' or a source-backed publication month.",
  ].join("\n")
}

/** Hosted-search guidance for stating timing explicitly in report prose. */
export function formatResearchTimingReportBlock(): string {
  return [
    "For publication and disclosure catalysts, state the expected publication month or window prominently — not only the fiscal quarter the data covers.",
    "Treat quarterly vehicle production/delivery reports and similar operational disclosures as first-class catalysts: name the quarter covered and when the report is expected (e.g. Q2 2026 deliveries data, expected early July 2026).",
    "Use 'timing unclear' only when no year, quarter, month, or date anchor appears in sources — not when the milestone name itself names a quarter.",
  ].join("\n")
}
