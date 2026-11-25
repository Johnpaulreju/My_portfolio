import { PROFILE, PROJECTS, SHOW_PROJECTS, SKILL_GROUPS, TIMELINE } from "@/lib/os/content"
import { PROFILE_AVAILABILITY, PROFILE_LEARNING, PROFILE_SUMMARY, SITE_URL, profileLink } from "@/lib/site"

// Preserve build-time generation after Next 15 changed GET caching defaults.
export const dynamic = "force-static"

export function GET() {
  const skills = SKILL_GROUPS.map((group) => `### ${group.label}\n\n${group.items.map((item) => item.name).join(", ")}.`).join("\n\n")
  const history = TIMELINE.map((event) => {
    const facts = event.facts.map((fact) => `- ${fact}`).join("\n")
    return `### ${event.label} · ${event.org} (${event.year})\n\n${facts}`
  }).join("\n\n")
  const projects = SHOW_PROJECTS ? PROJECTS.map((project) => {
    const title = project.url ? `[${project.title}](${project.url})` : project.title
    return [`### ${title}`, project.desc, project.stack].filter(Boolean).join("\n\n")
  }).join("\n\n") : ""
  const text = `# ${PROFILE.name}

${PROFILE.headline} · ${PROFILE.location}

${PROFILE_SUMMARY}

${PROFILE_AVAILABILITY}${projects ? `\n\n## Selected projects\n\n${projects}` : ""}

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
