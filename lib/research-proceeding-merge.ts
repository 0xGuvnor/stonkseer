/** Shared prompt guidance for merging regulatory/legal proceedings across sources. */

export function formatResearchProceedingMergeBlock(): string {
  return [
    "Regulatory, recall, and legal proceedings: when sources describe the same open investigation, engineering analysis, recall probe, enforcement action, or litigation, output one merged event — not separate rows for different editorial angles.",
    "Merge when any of: the same official ID (e.g. NHTSA EA/PE numbers, SEC/DOJ case refs, FDA application IDs, court docket); the same agency plus the same product/program subject (e.g. NHTSA + FSD + visibility/degraded vision); or the same named proceeding described as outcome vs status vs crash-count detail.",
    "Do not split rows that differ only by outcome vs status framing, crash counts, or timingShape open vs unknown when the proceeding is clearly ongoing. Prefer timingShape open with source-backed windowStart when the probe is active; never emit two rows for the same proceeding with mixed open and unknown.",
    "When sources cite an official investigation ID (e.g. EA26002), include it in summary. Title should name agency and subject once.",
    "Do not stitch conflicting vehicle counts, recall scope percentages, or calendar dates from different sources into one event unless one source states them together.",
  ].join("\n")
}

export function formatResearchProceedingReportBlock(): string {
  return [
    "For regulatory, recall, and legal proceedings, name the agency, official ID when available (e.g. NHTSA EA26002), product/program subject, and current status (open investigation, pre-recall, etc.) in each catalyst entry.",
    "Do not list the same open proceeding twice under different headlines — one entry per distinct investigation or case.",
  ].join("\n")
}

export function formatResearchProceedingExtractionSelfCheck(): string {
  return "If two events share the same regulator plus product/program subject or the same official investigation ID, they must be one merged event with combined sources."
}
