export type TubeVideo = {
  id: string
  title: string
  description: string
  src: string
  poster: string
  captions: string
  openCaptions: boolean
}

// The channel opens with its portfolio guide. IDs also appear in project watch links.
export const PUBLISHED_VIDEOS = [
  {
    id: "portfolio-tour",
    title: "A guided tour of Portfolio OS",
    description: "Power on the desktop, find Plan0 in Projects, open the Blog, ask MyGPT a question and explore the phone launcher.",
    src: "/media/guides/portfolio-tour.mp4",
    poster: "/media/guides/portfolio-tour-poster.jpg",
    captions: "/media/guides/portfolio-tour.en.vtt",
    openCaptions: false,
  },
  {
    id: "plan0-demo",
    title: "From idea to project pack with Plan0",
    description: "Enter an idea for a community garden watering schedule, answer five scripted questions in the local demo and open PRODUCT.md in the exported ZIP.",
    src: "/media/guides/plan0-demo.mp4",
    poster: "/media/guides/plan0-demo-poster.jpg",
    captions: "/media/guides/plan0-demo.en.vtt",
    openCaptions: false,
  },
] as const satisfies readonly TubeVideo[]

export type PublishedVideoId = (typeof PUBLISHED_VIDEOS)[number]["id"]

export function getPublishedVideo(id: string) {
  return PUBLISHED_VIDEOS.find((video) => video.id === id)
}
