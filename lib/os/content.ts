// Single source of truth for all portfolio content.
// Both the desktop (Windows) and mobile (Android) shells render from this.

export const PROFILE = {
  name: "Johnpaul K Reju",
  /** What I am today. */
  title: "Software Engineer",
  /** What I am growing into. Shown next to the title, never instead of it. */
  next: "Upcoming GenAI Engineer",
  headline: "Software Engineer · Upcoming GenAI Engineer",
  tagline: "I build websites, React Native apps and AI tools.",
  role: "Freelance Developer",
  availability: "Open to freelance projects. Tell me what you want to build.",
  learning: "I’m studying AI agents and new AI tools.",
  location: "Bangalore, India",
  email: "johnpaulreju2k@gmail.com",
  phone: "+91 77425 21023",
  linkedin: "linkedin.com/in/Johnpaulreju2k",
  github: "github.com/Johnpaulreju",
  initials: "JR",
  uvp: [
    "AI tools and full-stack web development.",
    "Mobile apps with React Native.",
    "Freelance development, from an idea to working software.",
  ],
} as const

/** Public personal work is unpublished; employer work stays in TIMELINE. */
export const PORTFOLIO_STATUS = {
  projects: {
    title: "Projects are cooking",
    body: "A few projects are cooking in the CPU. When they are ready, they will load here. Stay tuned.",
  },
  lab: {
    title: "Experiments are cooking",
    body: "Small experiments are cooking in the CPU. When they are ready, they will pop up here. Stay tuned.",
  },
} as const

export const SHOW_PROJECTS = false
export const SHOW_LAB = false

export type Project = {
  id: string
  title: string
  stack: string
  desc: string
  category: "AI / ML" | "Full-Stack" | "Computer Vision" | "Automation"
  year: string
}

// Do not bundle unpublished or uncurated work, even behind a display flag.
export const PROJECTS: Project[] = []

export type SkillStatus = "Building" | "Studying"
export type Skill = { name: string; status: SkillStatus }

export const SKILL_GROUPS: { label: string; hint: string; items: Skill[] }[] = [
  {
    label: "AI / ML",
    hint: "Models and AI tools",
    items: [
      { name: "Python", status: "Building" },
      { name: "LangChain", status: "Building" },
      { name: "KNN Modeling", status: "Building" },
      { name: "OpenAI API", status: "Building" },
      { name: "Custom LLM", status: "Building" },
    ],
  },
  {
    label: "Full-Stack",
    hint: "Websites, APIs and mobile apps",
    items: [
      { name: "React", status: "Building" },
      { name: "Next.js", status: "Building" },
      { name: "React Native", status: "Building" },
      { name: "FastAPI", status: "Building" },
      { name: "Django", status: "Building" },
      { name: "Node.js", status: "Building" },
      { name: "HTML / CSS / JS", status: "Building" },
    ],
  },
  {
    label: "Data & Cloud",
    hint: "Storage, pipelines and delivery",
    items: [
      { name: "SQL", status: "Building" },
      { name: "MongoDB", status: "Building" },
      { name: "PostgreSQL", status: "Building" },
      { name: "Supabase", status: "Building" },
      { name: "AWS", status: "Building" },
      { name: "Docker", status: "Building" },
      { name: "CI/CD", status: "Building" },
    ],
  },
  {
    label: "Special",
    hint: "The fun, less ordinary parts",
    items: [
      { name: "WebSocket", status: "Building" },
      { name: "WebRTC", status: "Building" },
      { name: "Figma-to-3D", status: "Building" },
      { name: "shadcn/ui", status: "Building" },
    ],
  },
  {
    label: "Ongoing Study",
    hint: "Learning as AI tools evolve",
    items: [
      { name: "AI Agents", status: "Studying" },
      { name: "New AI Technology", status: "Studying" },
    ],
  },
]

export type TimelineEvent = {
  year: number
  label: string
  org: string
  kind: "work" | "education"
  facts: string[]
}

export const TIMELINE: TimelineEvent[] = [
  { year: 2025, label: "Junior AI Engineer", org: "Odyssey Therapeia", kind: "work", facts: ["AI query handling and response workflows", "KNN-based ICU prediction model", "Workflow automation"] },
  { year: 2024, label: "MCA", org: "Kristu Jayanti College", kind: "education", facts: ["Robotics Fest Lead & Judge", "Research: ICU KNN model"] },
  { year: 2023, label: "Backend Developer", org: "KJSDC", kind: "work", facts: ["Backend work on Smart Admission Manager", "Custom scheduling and workflow automation"] },
  { year: 2022, label: "BCA", org: "JECRC University", kind: "education", facts: ["Cyber-Hackathon (AI security)"] },
]

export const ACHIEVEMENTS = [
  { title: "Cyber-Hackathon", detail: "AI security track", icon: "trophy" },
  { title: "Python — HackerRank", detail: "Certified", icon: "badge" },
  { title: "SQL — HackerRank", detail: "Certified", icon: "badge" },
  { title: "Java Basic", detail: "Certification", icon: "badge" },
] as const

export type LabItem = { title: string; note: string; progress: number }

export const LAB: readonly LabItem[] = []
