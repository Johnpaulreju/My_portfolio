// Single source of truth for all portfolio content.
// Both the desktop (Windows) and mobile (Android) shells render from this.

export const PROFILE = {
  name: "Johnpaul K Reju",
  title: "Full Stack AI Engineer",
  next: "Applied AI for web and mobile",
  headline: "Full Stack AI Engineer",
  tagline: "I build clinical software, storefronts and tools for developers.",
  introduction: "Johnpaul K Reju is a full stack AI engineer based in Bengaluru. At Odyssey Therapeia, he designed a clinical workspace with an AI scribe and built most of From The Trunk, a storefront for preloved sarees. He also builds websites for freelance clients and is developing Plan0, which helps people turn software ideas into project plans.",
  summary: "I’m a full stack AI engineer in Bengaluru. At Odyssey Therapeia, I designed a clinical workspace around the doctor’s first task of the day: finding an appointment and starting the AI scribe. I also built most of From The Trunk, a storefront for preloved sarees. Outside work, I build websites for clients and I’m developing Plan0, a tool for planning software through conversation.",
  role: "Clinical software and independent client work",
  availability: "Open to freelance web, mobile and applied AI projects.",
  learning: "I’m studying system design and data structures and algorithms. I’m especially interested in how architecture affects the cost of running AI features.",
  location: "Bengaluru, Karnataka, India",
  email: "johnpaulreju2k@gmail.com",
  phone: "+91 77425 21023",
  linkedin: "www.linkedin.com/in/johnpaul-k-reju",
  github: "github.com/Johnpaulreju",
  initials: "JR",
  uvp: [
    "I designed an appointment view that lets a doctor open a consultation and start taking notes in the same place.",
    "I connected live chat and avatars using WebSocket and WebRTC, and built streaming responses with FastAPI.",
    "I work in English, Malayalam and Hindi.",
  ],
} as const

export const PORTFOLIO_STATUS = {
  projects: {
    title: "Selected projects",
    body: "Employer work, client websites, personal projects and academic research.",
  },
  lab: {
    title: "Research and experiments",
    body: "My master’s research at Kristu Jayanti College explored ICU mortality prediction with k-nearest neighbors. You can find the study in Projects. I’ve also trained and tested a model in a game as part of my professional work.",
  },
} as const

export const SHOW_PROJECTS = true
export const SHOW_LAB = false

export type Project = {
  id: string
  title: string
  stack: string
  desc: string
  category: "AI / ML" | "Full-Stack" | "Web" | "Automation" | "Games"
  year: string
  url?: string
}

export const PROJECTS: Project[] = [
  {
    id: "clinical-emr", title: "Clinical workspace and AI scribe", category: "AI / ML", stack: "Next.js, Convex", year: "—",
    desc: "I built an electronic medical record system at Odyssey Therapeia. Doctors see the day’s appointments in a table and calendar, then open an appointment to start the AI scribe. Our team built a session portal for invited doctors to contribute notes. Staff can redact personal details when exporting a record.",
  },
  {
    id: "from-the-trunk", title: "From The Trunk", category: "Web", stack: "E-commerce, payments", year: "—", url: "https://www.fromthetrunk.shop/",
    desc: "I built most of this storefront for preloved sarees as part of my work at Odyssey Therapeia. My contributions included the introductory screens, storefront design and payment integration. I also worked on search visibility, page speed and operating costs.",
  },
  {
    id: "zion-safety-systems", title: "Zion Safety Systems", category: "Web", stack: "Web development", year: "—", url: "https://www.zionsafetysystems.com/",
    desc: "My first freelance client was Zion Safety Systems in Kochi. I built a site that introduces their alarms, sensors and monitoring services, optimized the images and delivered it in one week.",
  },
  {
    id: "spaaronn-technologies", title: "Spaaronn Technologies", category: "Web", stack: "Product catalogue", year: "—", url: "https://spaaronn.com/",
    desc: "I’m developing an industrial instrumentation catalogue for freelance client Spaaronn Technologies. Buyers can start with a product group and browse the instrument families within it.",
  },
  {
    id: "plan0", title: "Plan0", category: "AI / ML", stack: "Markdown, AI-assisted development", year: "—", url: "https://www.plan0.in/",
    desc: "I’m building Plan0 for people who want to turn a software idea into a brief for their coding agent. The local demo starts with a community garden watering schedule. Five planning prompts later, the exported ZIP contains a product brief and a build prompt based on the answers.",
  },
  {
    id: "smart-admission-manager", title: "Smart Admission Manager", category: "Automation", stack: "Django, SQL, JavaScript", year: "2023",
    desc: "As a backend developer at the Kristu Jayanti Software Development Cell, I built the scheduling logic for college admissions interviews. It matched students to Zoom slots using student availability and teacher allocation.",
  },
  {
    id: "conversational-avatars", title: "Conversational avatars", category: "AI / ML", stack: "React, FastAPI, LangChain", year: "—",
    desc: "At Odyssey Therapeia, I built the React interfaces for text and live chat and connected OpenAI-powered avatars using WebSocket and WebRTC. My backend work included query parsing and streaming responses with FastAPI.",
  },
  {
    id: "crm", title: "CRM task board and audio summaries", category: "Automation", stack: "MERN, FastAPI", year: "—",
    desc: "For Odyssey Therapeia, I built drag-and-drop task assignment and a workflow that transcribed audio and turned it into a summary with bullet points.",
  },
  {
    id: "hrms", title: "Human resources management system", category: "Full-Stack", stack: "AWS", year: "—",
    desc: "I deployed Odyssey Therapeia’s HR management application on AWS and handled hosting and scaling for the people using it internally and at client organizations.",
  },
  {
    id: "candidate-interface", title: "Candidate application interface", category: "Web", stack: "Figma, React", year: "—",
    desc: "At Odyssey Therapeia, I worked from a brief supplied by its partner, Alpha Company. I designed the candidate-facing screens in Figma and implemented the frontend in React.",
  },
  {
    id: "icu-research", title: "ICU mortality prediction research", category: "AI / ML", stack: "KNN", year: "2024",
    desc: "For my master’s research at Kristu Jayanti College, I studied ICU mortality prediction using k-nearest neighbors.",
  },
  {
    id: "portfolio-os", title: "Portfolio OS", category: "Web", stack: "Next.js, React, Zustand", year: "—",
    desc: "My personal portfolio presents the same work as a windowed desktop, a phone home screen and a printable résumé. Its apps share a single profile so visitors can browse or search for the same projects across devices.",
  },
  {
    id: "mafia", title: "Mafia", category: "Games", stack: "Game development", year: "—",
    desc: "I built Mafia as a personal game project.",
  },
]

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
      { name: "LLM integration", status: "Building" },
    ],
  },
  {
    label: "Full-Stack",
    hint: "Websites, APIs and mobile apps",
    items: [
      { name: "TypeScript", status: "Building" },
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
      { name: "Convex", status: "Building" },
      { name: "Supabase", status: "Building" },
      { name: "AWS", status: "Building" },
      { name: "Docker", status: "Building" },
      { name: "CI/CD", status: "Building" },
    ],
  },
  {
    label: "Interfaces & real-time systems",
    hint: "Live communication and interface design",
    items: [
      { name: "WebSocket", status: "Building" },
      { name: "WebRTC", status: "Building" },
      { name: "Figma", status: "Building" },
      { name: "shadcn/ui", status: "Building" },
    ],
  },
  {
    label: "Ongoing Study",
    hint: "What I’m learning now",
    items: [
      { name: "System design", status: "Studying" },
      { name: "Data structures and algorithms", status: "Studying" },
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
  {
    year: 2024, label: "AI and full-stack engineering", org: "Odyssey Therapeia → SlimCortex", kind: "work",
    facts: [
      "I joined Odyssey Therapeia as a Junior AI Engineer, began full-time work in June 2024 and continued with SlimCortex through an internal transition.",
      "At Odyssey I built clinical software with appointment scheduling, audio-to-note generation, a clinic chatbot and billing. I added a small on-screen pet companion to the workspace.",
      "My other Odyssey work included real-time avatars, business applications and the From The Trunk storefront.",
    ],
  },
  { year: 2024, label: "Master of Computer Applications (MCA)", org: "Kristu Jayanti College, Bengaluru", kind: "education", facts: ["2022–2024. Researched ICU mortality prediction using k-nearest neighbors.", "Led and judged events at the college robotics fest."] },
  { year: 2023, label: "Backend Developer", org: "Kristu Jayanti Software Development Cell", kind: "work", facts: ["March–April 2023. Built the interview scheduling logic for Smart Admission Manager using Django, SQL and JavaScript."] },
  { year: 2022, label: "Bachelor of Computer Applications (BCA)", org: "JECRC University, Jaipur", kind: "education", facts: ["2019–2022. Placed in the top ten at a cyber hackathon with an AI-based cybersecurity solution."] },
]

export const ACHIEVEMENTS = [
  { title: "Cyber-Hackathon", detail: "Top-ten finish with an AI-based cybersecurity solution at JECRC University", icon: "trophy" },
  { title: "Python — HackerRank", detail: "Certified", icon: "badge" },
  { title: "SQL — HackerRank", detail: "Certified", icon: "badge" },
  { title: "Java Basic", detail: "Certification", icon: "badge" },
] as const

export type LabItem = { title: string; note: string; progress: number }

export const LAB: readonly LabItem[] = []
