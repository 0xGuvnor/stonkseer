import type { Metadata, Viewport } from "next"
import { Fraunces, Geist, Geist_Mono } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"

import "./globals.css"
import { AppProviders } from "@/components/providers/app-providers"
import { clerkAppearance } from "@/lib/clerk-appearance"
import { cn } from "@/lib/utils"

const frauncesHeading = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-heading",
})

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "StonkSeer — AI-powered stock catalyst research",
  description:
    "Surface the regulatory and corporate catalysts that could move a ticker over the next 12 months.",
}

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: "#101513",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        geist.variable,
        frauncesHeading.variable
      )}
    >
      <body>
        <ClerkProvider appearance={clerkAppearance}>
          <AppProviders>{children}</AppProviders>
        </ClerkProvider>
      </body>
    </html>
  )
}
