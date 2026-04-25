"use client"

import { Show, SignInButton, UserButton } from "@clerk/nextjs"

import { Button } from "@/components/ui/button"

export function HomeAuthControls() {
  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <Button variant="outline">Sign in with Google</Button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </>
  )
}
