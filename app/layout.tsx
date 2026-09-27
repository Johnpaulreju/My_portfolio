import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { PROFILE } from "@/lib/os/content"
import { SITE_NAME, SITE_URL } from "@/lib/site"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" })

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${PROFILE.name}` },
  description: `${PROFILE.name} — ${PROFILE.headline}. A portfolio that boots, with readable profile and resume pages.`,
  applicationName: "Portfolio OS",
  authors: [{ name: PROFILE.name, url: `${SITE_URL}/about` }],
  // Fallback link preview for any page without its own. Pages set their own title, text and URL.
  openGraph: { type: "website", locale: "en_IN", siteName: SITE_NAME, url: SITE_URL },
  twitter: { card: "summary_large_image" },
}

export const viewport: Viewport = {
  themeColor: "#05070f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}
