import { PROFILE, SKILL_GROUPS, TIMELINE } from "@/lib/os/content"
import { PROFILE_AVAILABILITY, PROFILE_LEARNING, PROFILE_SUMMARY, SITE_URL, profileLink } from "@/lib/site"

// Preserve build-time generation after Next 15 changed GET caching defaults.
export const dynamic = "force-static"

export function GET() {
  const skills = SKILL_GROUPS.map((group) => `### ${group.label}\n\n${group.items.map((item) => item.name).join(", ")}.`).join("\n\n")
  const history = TIMELINE.map((event) => `- ${event.year}: ${event.label}, ${event.org} (${event.kind === "work" ? "work" : "education"}).`).join("\n")
  const text = `# ${PROFILE.name}

${PROFILE.headline} · ${PROFILE.location}

${PROFILE_SUMMARY}

${PROFILE_AVAILABILITY}

## Skills

${skills}

## Work and education

${history}

## Learning

${PROFILE_LEARNING}

## Contact

- [Email](mailto:${PROFILE.email})
- [GitHub](${profileLink(PROFILE.github)})
- [LinkedIn](${profileLink(PROFILE.linkedin)})
- [About](${SITE_URL}/about)
- [Resume](${SITE_URL}/resume)
`
  return new Response(text, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${SITE_URL}/about>; rel="canonical", <${SITE_URL}/llms.txt>; rel="describedby"`,
      "X-Robots-Tag": "noindex",
    },
  })
}
