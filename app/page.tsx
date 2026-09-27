import { PortfolioShell } from "@/components/os/portfolio-shell"
import { ProfileFallback } from "@/components/site/profile"
import { StructuredData } from "@/components/site/structured-data"
import { pageMetadata } from "@/lib/site"

export const metadata = pageMetadata("/")

export default function Home() {
  return (
    <>
      <StructuredData />
      <PortfolioShell>
        <ProfileFallback />
      </PortfolioShell>
    </>
  )
}
