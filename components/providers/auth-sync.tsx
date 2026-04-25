"use client"

import { useUser } from "@clerk/nextjs"
import { useEffect } from "react"
import { useMutation } from "convex/react"
import { useConvexAuth } from "convex/react"

import { api } from "@/convex/_generated/api"

export function AuthSync() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { isLoaded: clerkLoaded, user } = useUser()
  const storeUser = useMutation(api.users.store)
  const email = user?.primaryEmailAddress?.emailAddress
  const imageUrl = user?.imageUrl
  const name = user?.fullName ?? user?.firstName ?? undefined

  useEffect(() => {
    if (!isLoading && isAuthenticated && clerkLoaded) {
      void storeUser({ email, imageUrl, name })
    }
  }, [
    clerkLoaded,
    email,
    imageUrl,
    isAuthenticated,
    isLoading,
    name,
    storeUser,
  ])

  return null
}
