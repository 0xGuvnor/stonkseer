"use client"

import { Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import { type FormEvent, useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Id } from "@/convex/_generated/dataModel"
import type { PortfolioView } from "@/types/research-ui"

export type PortfolioToolbarProps = {
  portfolios: PortfolioView[]
  selectedPortfolioId: Id<"portfolios"> | null
  onSelectPortfolio: (portfolioId: Id<"portfolios">) => void
  onCreatePortfolio: (name: string) => Promise<Id<"portfolios">>
  onRenamePortfolio: (
    portfolioId: Id<"portfolios">,
    name: string,
  ) => Promise<void>
  onDeletePortfolio: (portfolioId: Id<"portfolios">) => Promise<void>
  autoOpenCreate?: boolean
}

export function PortfolioToolbar({
  portfolios,
  selectedPortfolioId,
  onSelectPortfolio,
  onCreatePortfolio,
  onRenamePortfolio,
  onDeletePortfolio,
  autoOpenCreate = false,
}: PortfolioToolbarProps) {
  const [createOpen, setCreateOpen] = useState(autoOpenCreate)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [nameInput, setNameInput] = useState("My Portfolio")
  const [isCreating, setIsCreating] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const selectedPortfolio = portfolios.find(
    (portfolio) => portfolio._id === selectedPortfolioId,
  )

  async function handleCreate(event?: FormEvent) {
    event?.preventDefault()
    setIsCreating(true)
    try {
      const portfolioId = await onCreatePortfolio(nameInput.trim())
      onSelectPortfolio(portfolioId)
      setCreateOpen(false)
      setNameInput("My Portfolio")
      toast.success("Portfolio created")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create portfolio.",
      )
    } finally {
      setIsCreating(false)
    }
  }

  async function handleRename(event?: FormEvent) {
    event?.preventDefault()
    if (!selectedPortfolioId) {
      return
    }

    const trimmedName = nameInput.trim()
    if (trimmedName.length === 0) {
      toast.error("Portfolio name is required.")
      return
    }

    setIsRenaming(true)
    try {
      await onRenamePortfolio(selectedPortfolioId, trimmedName)
      setRenameOpen(false)
      toast.success("Portfolio renamed")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not rename portfolio.",
      )
    } finally {
      setIsRenaming(false)
    }
  }

  async function handleDelete() {
    if (!selectedPortfolioId) {
      return
    }

    setIsDeleting(true)
    try {
      await onDeletePortfolio(selectedPortfolioId)
      setDeleteOpen(false)
      toast.success("Portfolio deleted")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete portfolio.",
      )
    } finally {
      setIsDeleting(false)
    }
  }

  function handleCreateOpenChange(open: boolean) {
    setCreateOpen(open)
    if (!open) {
      setIsCreating(false)
    }
  }

  function handleRenameOpenChange(open: boolean) {
    setRenameOpen(open)
    if (!open) {
      setIsRenaming(false)
    }
  }

  function handleDeleteOpenChange(open: boolean) {
    setDeleteOpen(open)
    if (!open) {
      setIsDeleting(false)
    }
  }

  function openRenameDialog() {
    setNameInput(selectedPortfolio?.name ?? "My Portfolio")
    setRenameOpen(true)
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          {portfolios.length > 0 && selectedPortfolioId ? (
            <Select
              value={selectedPortfolioId}
              onValueChange={(value) =>
                onSelectPortfolio(value as Id<"portfolios">)
              }
            >
              <SelectTrigger className="w-full min-w-0 sm:max-w-xs">
                <SelectValue placeholder="Select portfolio" />
              </SelectTrigger>
              <SelectContent>
                {portfolios.map((portfolio) => (
                  <SelectItem key={portfolio._id} value={portfolio._id}>
                    {portfolio.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">
              Create a portfolio to get started.
            </p>
          )}

          {selectedPortfolioId ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Portfolio actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={openRenameDialog}>
                  <Pencil className="size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-4" />
                  Delete portfolio
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        <Button
          onClick={() => {
            setNameInput("My Portfolio")
            setCreateOpen(true)
          }}
          className="bg-gradient-brand w-full text-primary-foreground shadow-sm sm:w-auto"
        >
          <Plus className="size-4" />
          New portfolio
        </Button>
      </div>

      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Create portfolio</DialogTitle>
              <DialogDescription>
                Give your portfolio a name to organize saved catalyst research.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="portfolio-create-name">Portfolio name</Label>
              <Input
                id="portfolio-create-name"
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={handleRenameOpenChange}>
        <DialogContent>
          <form onSubmit={handleRename}>
            <DialogHeader>
              <DialogTitle>Rename portfolio</DialogTitle>
              <DialogDescription>
                Update the name for {selectedPortfolio?.name ?? "this portfolio"}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="portfolio-rename-name">Portfolio name</Label>
              <Input
                id="portfolio-rename-name"
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isRenaming}>
                {isRenaming ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={handleDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedPortfolio?.name ?? "portfolio"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the portfolio and all tracked tickers and
              catalysts inside it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
