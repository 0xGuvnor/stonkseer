/** Extraction guidance for broad coverage without steering hosted search. */

export function formatResearchBreadthExtractionBlock(): string {
  return [
    "Cover all distinct milestone families that the reports or snippets support—product lines, technology programs, manufacturing or capacity, geographic or regulatory expansion, software or services, corporate actions, earnings, and similar themes.",
    "When the evidence discusses several unrelated families, include representative events for each family. Do not collapse output to a single narrative if other major families are also sourced.",
    "Use status 'likely' or 'speculative' with date windows when timing is inferred from reporting or cadence.",
  ].join("\n")
}
