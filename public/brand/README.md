# Portfolio OS icon sources

App icons keep the existing colored OS tiles. Images are functional glyphs, not vendor logos. Nimbus uses a cloud glyph on its coral tile and retains its original two-bar coral mark as a small badge. Vantage uses a compass on its existing teal tile.

## Loading and recovery

`lib/os/brand-icons.ts` explicitly maps every app to a known asset. `AppIcon` loads the pinned HTTPS image, then the bundled SVG on error, then keeps its built-in Lucide glyph if both fail. A glyph stays visible during loading. The tile and image have fixed dimensions and are decorative; the surrounding app control supplies its accessible name. Images send no referrer.

No extension guessing, mutable `main` URLs, or probes for absent local files remain. Add future assets to the map only after validating the exact response and committing the local copy and license.

## Source and license

The SVGs below are unmodified from [Lucide 0.454.0, commit dcd19cedc9fe69a6c6da30c65f412e2dbea585f7](https://github.com/lucide-icons/lucide/tree/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons). Remote images and bundled copies use that same commit. CSS makes the black strokes white inside the colored tiles; the source SVGs are unchanged.

The exact image URLs returned HTTP 200 and `image/svg+xml`; their corresponding pinned GitHub file pages returned HTTP 200 on 27 September 2026 (India time). All 25 SVGs were parsed and checked for the `0 0 24 24` viewBox. Availability may change; bundled copies remain usable if the upstream host is blocked or offline.

Lucide is ISC licensed, with portions derived from Feather (MIT). The release’s complete notice is preserved in [LICENSE-lucide](LICENSE-lucide). The Feather MIT notice is also included in [LICENSE-feather](LICENSE-feather), fetched from [1b002399e8758fb2bccea4d07312dc9e0f43dcb8](https://raw.githubusercontent.com/feathericons/feather/1b002399e8758fb2bccea4d07312dc9e0f43dcb8/LICENSE). Retain both notices when distributing these files. [Lucide’s license page](https://lucide.dev/license) explains the inherited Feather notice.

| Glyph / local bundled file | Pinned source page | Exact remote image |
| --- | --- | --- |
| [user-round](lucide/user-round.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/user-round.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/user-round.svg) |
| [folder-open](lucide/folder-open.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/folder-open.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/folder-open.svg) |
| [briefcase](lucide/briefcase.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/briefcase.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/briefcase.svg) |
| [activity](lucide/activity.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/activity.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/activity.svg) |
| [trophy](lucide/trophy.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/trophy.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/trophy.svg) |
| [flask-conical](lucide/flask-conical.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/flask-conical.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/flask-conical.svg) |
| [mail](lucide/mail.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/mail.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/mail.svg) |
| [cloud](lucide/cloud.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/cloud.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/cloud.svg) |
| [file-text](lucide/file-text.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/file-text.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/file-text.svg) |
| [file-type](lucide/file-type.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/file-type.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/file-type.svg) |
| [clapperboard](lucide/clapperboard.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/clapperboard.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/clapperboard.svg) |
| [folder](lucide/folder.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/folder.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/folder.svg) |
| [settings](lucide/settings.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/settings.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/settings.svg) |
| [square-terminal](lucide/square-terminal.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/square-terminal.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/square-terminal.svg) |
| [file-badge](lucide/file-badge.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/file-badge.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/file-badge.svg) |
| [party-popper](lucide/party-popper.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/party-popper.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/party-popper.svg) |
| [trash-2](lucide/trash-2.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/trash-2.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/trash-2.svg) |
| [hard-drive](lucide/hard-drive.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/hard-drive.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/hard-drive.svg) |
| [bomb](lucide/bomb.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/bomb.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/bomb.svg) |
| [spade](lucide/spade.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/spade.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/spade.svg) |
| [monitor-play](lucide/monitor-play.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/monitor-play.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/monitor-play.svg) |
| [bike](lucide/bike.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/bike.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/bike.svg) |
| [compass](lucide/compass.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/compass.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/compass.svg) |
| [alarm-clock](lucide/alarm-clock.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/alarm-clock.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/alarm-clock.svg) |
| [camera](lucide/camera.svg) | [File](https://github.com/lucide-icons/lucide/blob/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/camera.svg) | [SVG](https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons/camera.svg) |

These assets are open source; no confidential or paid asset service is involved. The original Nimbus badge is drawn in `components/os/app-icon.tsx`, following the existing mark in the browser app. No Google Chrome or other unrelated vendor logo stands in for Nimbus or Vantage.
