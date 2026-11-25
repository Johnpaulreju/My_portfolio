import type { AppId } from "./types"

// Each image is bundled from an attributed upstream source in public/brand.
export function brandIcon(appId: AppId): string {
  return `/brand/apps/${appId}.svg`
}
