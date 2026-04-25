"use client"

import { useEffect } from "react"
import { useMutation } from "convex/react"
import { useConvexAuth } from "convex/react"

import { api } from "@/convex/_generated/api"

export function AuthSync() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const storeUser = useMutation(api.users.store)

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      void storeUser()
    }
  }, [isAuthenticated, isLoading, storeUser])

  return null
}
