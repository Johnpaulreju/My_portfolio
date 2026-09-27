import { PROFILE } from "@/lib/os/content"
import { PROFILE_SUMMARY, SITE_URL } from "@/lib/site"

// Preserve build-time generation after Next 15 changed GET caching defaults.
export const dynamic = "force-static"

export function GET() {
  const text = `# ${PROFILE.name} — Portfolio OS

> ${PROFILE.headline}. ${PROFILE_SUMMARY}

Learning: ${PROFILE.learning}
Availability: ${PROFILE.availability}

A personal portfolio with an interactive desktop and readable profile pages. Work and education history are attributed to the named organizations. Projects and Lab are coming soon; no personal project catalogue is published.

## Profile

- [Profile in Markdown](${SITE_URL}/about.md): Skills, work and education history, learning, and contact links.
- [About](${SITE_URL}/about): Readable profile and freelance availability.
- [Resume](${SITE_URL}/resume): Printable work, education, and skills overview.

## Optional

- [Portfolio OS](${SITE_URL}): The interactive desktop and phone experience.
`
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
}
