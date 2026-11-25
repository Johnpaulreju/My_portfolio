import { PROFILE } from "@/lib/os/content"
import { PROFILE_SUMMARY, SITE_URL } from "@/lib/site"

// Preserve build-time generation after Next 15 changed GET caching defaults.
export const dynamic = "force-static"

export function GET() {
  const text = `# ${PROFILE.name} — Portfolio OS

> ${PROFILE.headline}. ${PROFILE_SUMMARY}

Learning: ${PROFILE.learning}
Availability: ${PROFILE.availability}

The project descriptions cover Johnpaul’s contributions to employer projects, freelance client websites, academic research, and personal products.

## Profile

- [Profile in Markdown](${SITE_URL}/about.md): Project credits and links, employer history, education, skills, and contact details.
- [About](${SITE_URL}/about): Readable profile, selected projects, and freelance availability.
- [Resume](${SITE_URL}/resume): Printable work, education, and skills overview.

## Optional

- [Portfolio OS](${SITE_URL}): The interactive desktop and phone experience.
`
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
}
