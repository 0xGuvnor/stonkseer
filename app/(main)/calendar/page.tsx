import { Calendar } from "lucide-react"

import { EmptyState } from "@/components/empty-state"

export default function CalendarPage() {
  return (
    <EmptyState
      icon={Calendar}
      eyebrow="Coming soon"
      title="A timeline of what's next"
      description="Upcoming catalysts from your saved portfolios will appear here on a unified calendar so nothing catches you off guard."
      cta={{ label: "Research a ticker", href: "/" }}
    />
  )
}
