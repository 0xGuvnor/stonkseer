import { Briefcase } from "lucide-react"

import { EmptyState } from "@/components/empty-state"

export default function PortfoliosPage() {
  return (
    <EmptyState
      icon={Briefcase}
      eyebrow="Coming soon"
      title="Your portfolios live here"
      description="Save catalyst research from any ticker and we'll organize it into portfolios you can track over time."
      cta={{ label: "Research a ticker", href: "/" }}
    />
  )
}
