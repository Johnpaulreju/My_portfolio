import type { MetadataRoute } from "next"
import { PROFILE } from "@/lib/os/content"
import { SITE_NAME } from "@/lib/site"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "Portfolio OS",
    description: `${PROFILE.name}, ${PROFILE.headline}. An interactive portfolio and readable profile.`,
    start_url: "/",
    display: "browser",
    background_color: "#05070f",
    theme_color: "#05070f",
    icons: [{ src: "/favicon.ico", sizes: "48x48 32x32 16x16", type: "image/x-icon" }],
  }
}
