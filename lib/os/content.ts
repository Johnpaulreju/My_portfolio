// Single source of truth for all portfolio content.
// Both the desktop (Windows) and mobile (Android) shells render from this.

export const PROFILE = {
  name: "Johnpaul K Reju",
  title: "AI Engineer & Full-Stack Developer",
  tagline: "Fusing creativity with technology and intelligence.",
  location: "Bangalore, India",
  email: "johnpaulreju2k@gmail.com",
  phone: "+91 77425 21023",
  linkedin: "linkedin.com/in/Johnpaulreju2k",
  github: "github.com/Johnpaulreju",
  initials: "JR",
  uvp: [
    "Rapid AI-assisted development with creative problem-solving.",
    "Bridge between AI/ML innovation and real-world full-stack delivery.",
    "Proven: 85% ML accuracy · 70% efficiency gain · 30% faster dev.",
  ],
} as const

export type Project = {
  id: string
  title: string
  stack: string
  desc: string
  category: "AI / ML" | "Full-Stack" | "Computer Vision" | "Automation"
  year: string
}

export const PROJECTS: Project[] = [
  { id: "img-3d", title: "2D→3D Image Converter", stack: "Python + OpenCV", desc: "Turns flat images into 3-D.", category: "Computer Vision", year: "2024" },
  { id: "gpt-clone", title: "ChatGPT Clone", stack: "Next.js · WebRTC", desc: "Text & voice with custom tools.", category: "AI / ML", year: "2024" },
  { id: "video-hub", title: "Video Hub Automation", stack: "FastAPI · React Native", desc: "Public video manager.", category: "Automation", year: "2024" },
  { id: "jarvis", title: "AI Voice Assistant", stack: "Python", desc: "JARVIS with 10+ skills.", category: "AI / ML", year: "2023" },
  { id: "ocr-lab", title: "OCR Lab Analyzer", stack: "Python · Tesseract", desc: "Reads reports, outputs charts.", category: "Computer Vision", year: "2024" },
  { id: "face-car", title: "Face-Controlled Car", stack: "Python · Mediapipe", desc: "Drive 2-D car with head tilt.", category: "Computer Vision", year: "2023" },
  { id: "icu", title: "ICU Predictor", stack: "Jupyter · Scikit-learn", desc: "KNN 85% accuracy.", category: "AI / ML", year: "2024" },
  { id: "hospital", title: "Hospital Website", stack: "Node.js · HTML", desc: "Full-stack booking & CMS.", category: "Full-Stack", year: "2023" },
  { id: "vkeyboard", title: "Vision Virtual Keyboard", stack: "Python · Mediapipe", desc: "Air-typing & shortcuts.", category: "Computer Vision", year: "2023" },
  { id: "orchestrator", title: "AI Agent Orchestrator", stack: "LangChain · FastAPI", desc: "Multi-API workflows.", category: "AI / ML", year: "2025" },
  { id: "emotion", title: "Emotion Detector", stack: "Flask · TensorFlow", desc: "Real-time webcam sentiment.", category: "Computer Vision", year: "2023" },
  { id: "flask-bot", title: "Flask Chatbot", stack: "Flask · LangChain", desc: "Basic conversational AI.", category: "AI / ML", year: "2022" },
]

export const SKILL_GROUPS: { label: string; hint: string; items: { name: string; level: number }[] }[] = [
  {
    label: "AI / ML",
    hint: "Models, agents and LLM tooling",
    items: [
      { name: "Python", level: 92 },
      { name: "LangChain", level: 85 },
      { name: "KNN Modeling", level: 85 },
      { name: "OpenAI API", level: 88 },
      { name: "Custom LLM", level: 74 },
    ],
  },
  {
    label: "Full-Stack",
    hint: "Product surfaces, front to back",
    items: [
      { name: "React", level: 90 },
      { name: "Next.js", level: 88 },
      { name: "FastAPI", level: 84 },
      { name: "Django", level: 76 },
      { name: "Node.js", level: 80 },
      { name: "HTML / CSS / JS", level: 93 },
    ],
  },
  {
    label: "Data & Cloud",
    hint: "Storage, pipelines and delivery",
    items: [
      { name: "SQL", level: 86 },
      { name: "MongoDB", level: 78 },
      { name: "PostgreSQL", level: 80 },
      { name: "Supabase", level: 75 },
      { name: "AWS", level: 70 },
      { name: "Docker", level: 74 },
      { name: "CI/CD", level: 72 },
    ],
  },
  {
    label: "Special",
    hint: "The fun, less ordinary parts",
    items: [
      { name: "WebSocket", level: 82 },
      { name: "WebRTC", level: 76 },
      { name: "Figma-to-3D", level: 70 },
      { name: "shadcn/ui", level: 88 },
      { name: "AI Agents", level: 84 },
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
  { year: 2025, label: "Junior AI Engineer", org: "Odyssey Therapeia", kind: "work", facts: ["+25% query handling, +20% engagement, latency -30%", "KNN ICU predictor 85% accuracy", "Manual effort -35%"] },
  { year: 2024, label: "MCA", org: "Kristu Jayanti College", kind: "education", facts: ["Robotics Fest Lead & Judge", "Research: ICU KNN model"] },
  { year: 2023, label: "Backend Developer", org: "KJSDC", kind: "work", facts: ["Smart Admission Manager ↑ 80% efficiency", "Custom scheduler, manual effort -70%"] },
  { year: 2022, label: "BCA", org: "JECRC University", kind: "education", facts: ["Cyber-Hackathon Top-10 (AI security)"] },
]

export const ACHIEVEMENTS = [
  { title: "Cyber-Hackathon Top-10", detail: "AI security track", icon: "trophy" },
  { title: "Python — HackerRank", detail: "Certified", icon: "badge" },
  { title: "SQL — HackerRank", detail: "Certified", icon: "badge" },
  { title: "Java Basic", detail: "Certification", icon: "badge" },
  { title: "API integration ↑ 40%", detail: "Efficiency gain delivered", icon: "chart" },
  { title: "Development speed ↑ 30%", detail: "Across team workflows", icon: "chart" },
] as const

export const LAB = [
  { title: "Sign-Language Recognizer", note: "Hand tracking, accessibility.", progress: 62 },
  { title: "Voice-Modulation Agents", note: "DSP + LLM personas.", progress: 38 },
] as const
