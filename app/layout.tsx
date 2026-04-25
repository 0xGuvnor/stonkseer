import { Geist, Geist_Mono, Merriweather } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"

import "./globals.css"
import { AppProviders } from "@/components/providers/app-providers"
import { cn } from "@/lib/utils"

const merriweatherHeading = Merriweather({
  subsets: ["latin"],
  variable: "--font-heading",
})

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

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
        merriweatherHeading.variable
      )}
    >
      <body>
        <ClerkProvider>
          <AppProviders>{children}</AppProviders>
        </ClerkProvider>
      </body>
    </html>
  )
}
