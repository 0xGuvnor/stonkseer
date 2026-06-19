import { Kbd, KbdGroup } from "@/components/ui/kbd"

function ShortcutHint({
  keyLabel,
  className,
}: {
  keyLabel: string
  className?: string
}) {
  return (
    <KbdGroup className={className}>
      <Kbd>⌘</Kbd>
      <Kbd>{keyLabel}</Kbd>
    </KbdGroup>
  )
}

export function CmdKHint({ className }: { className?: string }) {
  return <ShortcutHint keyLabel="K" className={className} />
}

export function CmdBHint({ className }: { className?: string }) {
  return <ShortcutHint keyLabel="B" className={className} />
}
