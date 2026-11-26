import { PROFILE } from "./content"

export const profileContactLinks = [
  { label: "Email Johnpaul", url: `mailto:${PROFILE.email}` },
  { label: "Call Johnpaul", url: `tel:${PROFILE.phone.replace(/\s/g, "")}` },
]

/** Chat links may open an HTTPS page, or the portfolio owner's published email or phone. */
export function isProfileReplyUrl(url: string) {
  return /^https:\/\//i.test(url) || profileContactLinks.some((contact) => contact.url === url)
}
